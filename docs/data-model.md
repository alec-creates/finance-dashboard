# Data model

Design for **all phases**. Phase 1 Task 3 turns this into `prisma/schema.prisma` in full, so later phases add behaviour,
not disruptive migrations. Pseudo-Prisma below; every user-owned table carries `userId` (directly or through its parent
account) and every service query filters by it.

**Nothing personal is hardcoded.** Institutions, accounts, categories, pay schedules, contribution amounts and splits,
the checking cushion, goals and the dashboard layout are all rows owned by a user. Code may ship _defaults_ (a starter
category set, a default dashboard layout), but no logic depends on a specific name or amount.

## Numeric precision

| Value                               | Column type         | TS type          |
| ----------------------------------- | ------------------- | ---------------- |
| USD amounts, balances, market value | `Int` (cents)       | `number`         |
| Share / crypto quantity             | `Decimal(38,18)`    | `Prisma.Decimal` |
| Unit price                          | `Decimal(24,10)`    | `Prisma.Decimal` |
| FX rate (future)                    | `Decimal(24,12)`    | `Prisma.Decimal` |
| Percentages (20% = 0.200000)        | `Decimal(7,6)`      | `Prisma.Decimal` |
| Transaction / valuation dates       | `DateTime @db.Date` | `string` (ISO)   |

`Int` cents caps a single value at about $21.4M, which is far above this app's range and documented in ADR-0002.
Value = quantity x price is computed in decimal and rounded half-even to cents once.

## Identity and settings

```prisma
model User         { id, email @unique, name, createdAt }   // + Better Auth tables (Session, Account, Verification, TwoFactor/Passkey)
model UserSettings {
  userId PK, timeZone String,               // IANA, e.g. "America/Chicago"
  currency String @default("USD"),
  costBasisMethod  CostBasisMethod @default(FIFO),
  forecastLookbackMonths Int @default(6)
}

model SafeToSpendSettings {
  userId PK
  spendingAccountIds String[]               // which cash accounts count as spendable (e.g. a checking account)
  applyCushion Boolean @default(true)       // subtract each account's minimumBalanceCents
  horizon SafeToSpendHorizon @default(NEXT_PAYDAY) // NEXT_PAYDAY | END_OF_MONTH | DAYS
  horizonDays Int?                          // when horizon = DAYS
  includeGoalContributions Boolean @default(true)
  includePlannedInvestments Boolean @default(true)
}
```

The cushion is configured per account (`FinancialAccount.minimumBalanceCents`, default none), so any account can have
one and nothing assumes a specific amount.

## Connections and accounts

```prisma
model Connection {               // one per provider login (Plaid Item, Kraken API key, CSV-only = none)
  id, userId, provider Provider // MANUAL | CSV | PLAID | KRAKEN | WEBULL
  institutionName, status ConnectionStatus // ACTIVE | NEEDS_REAUTH | ERROR | DISCONNECTED
  encryptedCredentials Bytes?, credentialKeyVersion Int?
  syncCursor String?, lastSyncAttemptAt, lastSyncSuccessAt, lastErrorCode, lastErrorMessage // sanitized, no payloads
}

model FinancialAccount {
  id, userId, connectionId?
  name, institutionName, mask String?, externalId String?
  type AccountType   // CHECKING | SAVINGS | CREDIT_CARD | INVESTMENT | CASH | OTHER_ASSET | LOAN | OTHER_LIABILITY
  investmentType InvestmentAccountType? // required when type = INVESTMENT:
                     // TAXABLE_BROKERAGE | TRADITIONAL_IRA | ROTH_IRA | CRYPTO_EXCHANGE | OTHER_INVESTMENT
  isLiability Boolean // derived from type, stored for fast net-worth queries
  currency String @default("USD")
  includeInNetWorth Boolean @default(true)
  minimumBalanceCents Int?               // optional cushion used by Safe to Spend
  historyCompleteFrom DateTime? @db.Date  // earliest date with complete transaction history (gates realized gains)
  archivedAt
}

model BalanceSnapshot {          // historical balances for cash/credit/manual accounts
  id, accountId, asOfDate @db.Date, balanceCents Int, availableCents Int?
  source SnapshotSource          // PROVIDER | STATEMENT | MANUAL | COMPUTED
  @@unique([accountId, asOfDate, source])
}
```

Manual assets and debts are ordinary `FinancialAccount`s (`OTHER_ASSET`, `LOAN`, `OTHER_LIABILITY`) with manual
snapshots, so net worth has one code path.

## Cash transactions (bank and credit card accounts)

```prisma
model Transaction {
  id, userId, accountId
  date @db.Date, authorizedDate @db.Date?
  amountCents Int                 // signed from the account's view: negative = money out
  description String              // raw text, never edited
  merchantId?
  kind TxnKind                    // INCOME | EXPENSE | REFUND | TRANSFER | CREDIT_CARD_PAYMENT
                                  // | INVESTMENT_CONTRIBUTION | INVESTMENT_WITHDRAWAL | ADJUSTMENT
  status TxnStatus                // PENDING | POSTED
  reviewStatus ReviewStatus       // NEEDS_REVIEW | CONFIRMED
  categorySource CategorySource   // RULE | MERCHANT_MEMORY | PROVIDER | MANUAL | NONE
  appliedRuleId?, incomeSourceId?
  excludeFromBudget Boolean @default(false)
  notes String?
  transferPairId String?          // both legs of a transfer / card payment / investment contribution share it
  externalId String?, pendingExternalId String?
  fingerprint String              // CSV dedupe key (see below)
  importBatchId?
  raw Json                        // original row or payload
  splits TransactionSplit[]
  @@unique([accountId, externalId])
  @@index([userId, date]) @@index([userId, reviewStatus]) @@index([accountId, fingerprint])
}

model TransactionSplit { id, transactionId, categoryId, amountCents Int, note? }   // >= 1 per transaction, sum == amountCents
model Category  { id, userId, name, parentId?, type CategoryType /* EXPENSE | INCOME */, isEssential Boolean, color, sortOrder, archivedAt }
model Merchant  { id, userId, name, matchKey @unique per user, defaultCategoryId? }
model CategorizationRule {
  id, userId, priority Int, isActive
  field RuleField /* DESCRIPTION | MERCHANT */, matchType MatchType /* CONTAINS | EQUALS | STARTS_WITH | REGEX */, pattern
  accountId?, minAmountCents?, maxAmountCents?
  setCategoryId?, setKind?, setMerchantId?
}
model ImportBatch {
  id, userId, accountId, source /* CSV | PROVIDER_SYNC */, adapterId, fileName?, fileSha256
  rowCount, importedCount, duplicateCount, errorCount, status /* PREVIEW | COMMITTED | REVERTED */, createdAt
}
model CsvImportProfile { id, userId, name, institution, columnMap Json, dateFormat, amountConvention, hasHeader, ... }
```

Rules: lowest `priority` wins; ties go to the oldest rule. Dedupe: provider `externalId` when present; otherwise
`fingerprint = hash(accountId, date, amountCents, normalizedDescription, occurrenceIndexWithinFile)`, and near matches
(same amount, +/-2 days) are flagged for review, never dropped silently.

## Investments (e.g. a taxable brokerage account, a Roth IRA at the same broker, a crypto exchange)

Each investment account is its own `FinancialAccount` with an `investmentType`. A Roth IRA at the same broker as a
taxable account is a **separate account** (it may share the `Connection`). Holdings can be grouped by account type,
asset class and individual asset. Stocks, ETFs and crypto are supported first; `OPTION` exists in the enum so options
can be added later without a migration, but no options logic is planned.

```prisma
model Asset {                    // shared reference data, not user-owned
  id, symbol, name, assetClass AssetClass // EQUITY | ETF | MUTUAL_FUND | CRYPTO | CASH | OPTION (reserved) | OTHER
  quoteCurrency @default("USD"), externalIds Json
  @@unique([assetClass, symbol])
}
model AssetPrice { assetId, date @db.Date, close Decimal(24,10), source; @@id([assetId, date, source]) }
model FxRate     { base, quote, date @db.Date, rate Decimal(24,12), source }   // USD-only today; schema ready

model InvestmentTransaction {
  id, userId, accountId, assetId?
  tradeDate @db.Date, settleDate @db.Date?
  type InvTxnType  // BUY | SELL | DIVIDEND | INTEREST | FEE | DEPOSIT | WITHDRAWAL | TRANSFER_IN | TRANSFER_OUT
                   // | STAKING_REWARD | SPLIT | CORPORATE_ACTION | OTHER
  quantity Decimal(38,18)?, unitPrice Decimal(24,10)?
  cashAmountCents Int              // signed effect on the account's USD cash
  feeCents Int @default(0), feeAssetId?, feeQuantity Decimal(38,18)?
  groupRef String?                 // links legs of one event (Kraken ledger refid, crypto-to-crypto trades)
  linkedCashTransactionId?         // the bank leg of a deposit/withdrawal
  contributionTaxYear Int?         // IRA deposits: the tax year the contribution counts toward
  externalId?, fingerprint, importBatchId?, raw Json
}

model HoldingSnapshot {            // positions as reported or computed at a date
  id, accountId, assetId, asOfDate @db.Date
  quantity Decimal(38,18), costBasisCents Int?, priceUsed Decimal(24,10)?, marketValueCents Int?
  source SnapshotSource
  @@unique([accountId, assetId, asOfDate, source])
}

model PortfolioValuation {         // total account value at a date; never interpolated
  id, accountId, asOfDate @db.Date, marketValueCents Int, cashCents Int, source SnapshotSource
  @@unique([accountId, asOfDate, source])
}
```

Realized gains use FIFO lots computed from `InvestmentTransaction`s and are shown only from `historyCompleteFrom`
onwards. Gains are estimates for planning, not tax reporting.

## Schedules

Pay dates, contribution dates and recurring bills share one schedule shape (ADR-0006), implemented in
`src/lib/schedules.ts` and stored as a `Json` column validated by the same rules:

| `frequency`    | Fields                                     | Example            |
| -------------- | ------------------------------------------ | ------------------ |
| `weekly`       | `anchorDate`                               | every Friday       |
| `biweekly`     | `anchorDate`                               | every other Friday |
| `semimonthly`  | `daysOfMonth: [d1, d2]` (1-31 or `"last"`) | 15th and last day  |
| `monthly`      | `dayOfMonth` (1-31 or `"last"`)            | the 1st            |
| `everyNDays`   | `anchorDate`, `intervalDays`               | every 10 days      |
| `everyNMonths` | `anchorDate`, `intervalMonths`             | quarterly          |

All schedules accept `weekendAdjustment: none | previousBusinessDay | nextBusinessDay`. Days past the end of a month
clamp to its last day. Bank holidays are not modelled.

## Income and contributions

```prisma
model IncomeSource {
  id, userId, name, type IncomeType // HOURLY | SALARY | COMMISSION | BONUS | OTHER
  schedule Json?                    // pay schedule; null = irregular
  depositAccountId, matchPattern String?
  hourlyRateCents Int?, typicalWeeklyHours Decimal(6,2)?, takeHomeRatio Decimal(7,6)?
}

model ContributionPlan {
  id, userId, name, sourceAccountId          // where the money leaves from (e.g. a checking account)
  ruleType ContributionRuleType              // FIXED_AMOUNT | PERCENT_OF_INCOME | PERCENT_OF_PAYCHECK
  fixedAmountCents Int?                      // FIXED_AMOUNT: per scheduled date
  percent Decimal(7,6)?                      // 0.200000 = 20%
  minimumCents Int?                          // floor per scheduled date
  incomeSourceId?                            // PERCENT_OF_PAYCHECK: whose paychecks; PERCENT_OF_INCOME: optional filter
  schedule Json?                             // contribution dates; PERCENT_OF_PAYCHECK uses the paycheck dates instead
  status PlanStatus                          // ACTIVE | PAUSED
  effectiveFrom @db.Date, effectiveTo @db.Date?, deletedAt?
}
model ContributionAllocation { id, planId, targetAccountId, share Decimal(7,6) }   // e.g. 0.7 / 0.3; shares sum to 1
model ContributionOverride   { id, planId, scheduledDate @db.Date, amountCents Int?, skip Boolean, note? }
```

Planned targets are computed, never stored:

- `FIXED_AMOUNT`: the amount on each scheduled date.
- `PERCENT_OF_PAYCHECK`: percent x each matched paycheck, on that payday.
- `PERCENT_OF_INCOME`: percent x income received in the contribution period `(previousDate, scheduledDate]`. This works
  for any pairing (weekly contributions with biweekly pay, monthly with semimonthly, ...); some periods may be $0.

Each target is `max(minimum, round_half_even(x))`, then an override replaces it or skips it, and it is split across
allocations with largest-remainder rounding so the parts sum exactly. Paused plans and deleted plans produce no targets
(history of actual contributions is kept). Actual = `INVESTMENT_CONTRIBUTION` transactions from `sourceAccountId` to an
allocation's account, matched to the target period, and linked to the investment account's `DEPOSIT` via
`transferPairId` / `linkedCashTransactionId` so the money is counted once. Contributions into a Roth IRA are
contributions, never expenses.

## Budgets, recurring items, goals, forecasts, net worth

```prisma
model Budget           { id, userId, month @db.Date /* first of month */, categoryId, amountCents, rollover Boolean; @@unique([userId, month, categoryId]) }
model RecurringSeries  { id, userId, name, merchantId?, accountId, categoryId?, kind, expectedAmountCents, toleranceCents,
                         schedule Json, nextExpectedDate @db.Date, status /* SUGGESTED | ACTIVE | DISMISSED */ }
model SavingsGoal      { id, userId, name, targetCents, targetDate @db.Date?, linkedAccountId?, monthlyTargetCents?,
                         priority Int, status /* ACTIVE | PAUSED | COMPLETED | ARCHIVED */ }
model GoalLedgerEntry  { id, goalId, accountId, date @db.Date, amountCents Int /* signed */, type /* ALLOCATE | RELEASE | WITHDRAW */, note? }
model ForecastScenario { id, userId, name, baseline /* HISTORICAL | BUDGET */, lookbackMonths, contributionPercentOverride Decimal(7,6)?,
                         categoryAdjustments Json, marketGrowthAnnual Decimal(7,6)? /* null = no growth */, includeGoals Boolean }
model NetWorthSnapshot { userId, asOfDate @db.Date, assetsCents, liabilitiesCents, cashCents, investmentsCents, otherAssetsCents,
                         completeness Json /* accounts missing data for that date */; @@id([userId, asOfDate]) }
```

- **Goals never double count:** a goal's saved amount is the sum of its ledger entries, and for each account the sum of
  all goals' allocations must not exceed the account balance (the UI warns and blocks new allocations).
- **Net worth history** is derived from balance snapshots and portfolio valuations and cached in `NetWorthSnapshot`
  (rebuildable). Bank balances carry forward between snapshots; investment values do not, so missing valuations
  show as gaps and the snapshot records which accounts are incomplete.
- **Monthly net worth change** is decomposed into cash flow (income - expenses), contributions, and market change
  (change in investment value - net contributions).

## Safe to Spend

For the horizon in `SafeToSpendSettings` (default: today until the day before the next expected paycheck):

```
  available balance of the spending accounts
- their minimum balances                       (if applyCushion)
- recurring bills due in the horizon and not yet paid
- remaining expected essential spending        (essential-category budgets, or history, prorated to the horizon, minus spent)
- planned investment contributions due          (if includePlannedInvestments)
- planned goal contributions due                (if includeGoalContributions)
= Safe to Spend
```

Expected income inside the horizon is **not** added; it is shown separately ("after your next paycheck") because it
has not arrived. A negative result is shown as negative with the breakdown, never clamped to zero.

## Dashboard layouts (ADR-0005)

```prisma
model DashboardLayout {
  id, userId
  breakpoint LayoutBreakpoint     // MOBILE | DESKTOP
  version Int                     // layout schema version, for migrations of the JSON
  widgets Json                    // [{ instanceId, type, x, y, w, h, settings }] (mobile uses order only)
  updatedAt
  @@unique([userId, breakpoint])
}
```

Widget types are defined in code (a registry with title, group, default and allowed sizes, a settings schema and a
data loader). With no saved row the code-defined default layout is used; "restore default" deletes the row. Unknown
widget types in saved JSON are skipped, not errors.

## Cash-flow buckets

| Bucket                   | Source                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| Income                   | `INCOME`                                                              |
| Living expenses          | splits of `EXPENSE` + `REFUND`, excluding `excludeFromBudget`         |
| Investment contributions | `INVESTMENT_CONTRIBUTION` - `INVESTMENT_WITHDRAWAL`                   |
| Ignored (internal)       | `TRANSFER`, `CREDIT_CARD_PAYMENT`, `ADJUSTMENT`                       |
| Market gains/losses      | investment valuations only; never in cash flow                        |
| Buys/sells               | `InvestmentTransaction` inside the investment account; never spending |

Cash remaining = income - living expenses - net contributions. Contribution rate = net contributions / income.
