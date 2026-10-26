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

## Integrity rules (ADR-0009)

These apply to every model below; the pseudo-Prisma omits them for brevity.

**Ownership is enforced by the database.** Every user-owned table has a `userId` column. Parent tables declare
`@@unique([id, userId])`, and children reference them through composite relations that include `userId`, e.g.
`Transaction (accountId, userId) -> FinancialAccount (id, userId)` and
`TransactionSplit (categoryId, userId) -> Category (id, userId)`. A row can therefore never point at another user's
account, category, plan or goal, and a child's `userId` can never disagree with its parent's.

**One sign convention everywhere: the owner's net-worth view.** Positive means the owner has more; negative means less.

| Event            | Account                                 | `amountCents` |
| ---------------- | --------------------------------------- | ------------- |
| Paycheck deposit | checking                                | `+`           |
| Card purchase    | credit card                             | `-`           |
| Card payment     | checking `-` / credit card `+` (paired) | both legs     |
| Refund to card   | credit card                             | `+`           |

Balances follow the same rule: a card or loan balance owed is stored **negative** (owing $420 is `-42000`), so net
worth is a plain sum of the latest balances and valuations of accounts with `includeInNetWorth`. Provider adapters
convert their own conventions on import (Plaid, for example, reports card balances as positive amounts owed).

**Delete behaviour (`onDelete`).**

| Deleting                                     | Effect                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| User                                         | Cascades to everything the user owns                                                         |
| Import batch (undo import)                   | Deletes its transactions and their splits; the UI warns first if any were reviewed or edited |
| Transaction                                  | Cascades to its splits                                                                       |
| Financial account, category, merchant, asset | Restricted while history references them; archive instead (`archivedAt`)                     |
| Contribution plan, recurring series, goal    | Soft delete (`deletedAt` / `status`) so matched history keeps its link                       |

"Restricted" relations use `NO ACTION` (checked at the end of the statement) rather than `RESTRICT`, so deleting a user
can remove parents and children in one cascading statement. Optional composite relations never use `SET NULL`, which
would also null `userId`. Every foreign key is `ON UPDATE NO ACTION`: a row's owner can never be changed while other
rows refer to it.

**Database constraints** added as SQL in the migration where Prisma cannot express them:

- `Budget.month` is the first day of a month.
- `investmentType` is set if and only if `type = INVESTMENT`.
- Fractions (`percent`, `share`, `takeHomeRatio`, `contributionPercentOverride`) are between 0 and 1.
- Non-negative amounts: budgets, minimums, fixed contribution amounts, overrides, goal targets, tolerances,
  `minimumBalanceCents`.
- `ContributionOverride` either skips or has an amount.
- Category names are unique per user and parent, case-insensitive (`NULLS NOT DISTINCT`, so top-level names are
  unique too); merchant match keys are unique per user.
- Accounts are USD-only for now; Safe to Spend applies only to checking, savings and cash accounts.
- Investment transactions: quantities, prices, fees and USD values are non-negative magnitudes; cash moves in the
  direction the type implies (BUY/FEE/WITHDRAWAL <= 0; SELL/DIVIDEND/INTEREST/DEPOSIT >= 0); BUY, SELL and
  STAKING_REWARD need an asset and a positive quantity; staking rewards need a USD value; tax years only on deposits.
- Goal ledger signs follow the entry type (ALLOCATE > 0, RELEASE/WITHDRAW < 0); net worth liabilities <= 0.

**Deferred invariants** (constraint triggers checked at `COMMIT`, so a parent and its children can be written in any
order within one database transaction):

- Every transaction has at least one split, and its splits sum exactly to `amountCents`.
- A contribution plan's allocation shares sum to exactly 1 whenever it has allocations.

**App-level invariants** (enforced in services and covered by tests): goal allocations on an account do not exceed
its balance; budget hierarchy (below); category parents share their child's type; both legs of a transfer net to zero;
a transaction's sign matches its kind; contribution targets are investment accounts.

**Every table** has `createdAt` and `updatedAt`. IDs are `cuid()` strings.

## Identity and settings

```prisma
model User         { id, name, email @unique, emailVerified, image?, twoFactorEnabled, createdAt, updatedAt }
                   // Shape owned by Better Auth (ADR-0010), with Session, Account (sign-in methods, not financial
                   // accounts), Verification, TwoFactor (encrypted TOTP secret and backup codes, lockout state) and
                   // RateLimit (database-backed rate-limit buckets). All app tables reference User.id with onDelete: Cascade.
model UserSettings {
  userId PK, timeZone String,               // IANA, e.g. "America/Chicago"
  currency String @default("USD"),
  costBasisMethod  CostBasisMethod @default(FIFO),
  forecastLookbackMonths Int @default(6)
}

model SafeToSpendSettings {
  userId PK
  // Spendable accounts are chosen with FinancialAccount.includeInSafeToSpend (a real relation, not an id list).
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
  // No stored isLiability: liability types (CREDIT_CARD, LOAN, OTHER_LIABILITY) are known from `type`, and
  // their balances are negative by the sign convention, so nothing can drift out of sync.
  currency String @default("USD")
  includeInNetWorth Boolean @default(true)
  includeInSafeToSpend Boolean @default(false)
  minimumBalanceCents Int?               // optional cushion used by Safe to Spend (>= 0)
  historyCompleteFrom DateTime? @db.Date  // earliest date with complete transaction history (gates realized gains)
  archivedAt
  @@unique([id, userId])
}

model BalanceSnapshot {          // historical balances for cash/credit/manual accounts
  id, userId, accountId, asOfDate @db.Date
  balanceCents Int               // signed: card/loan balances owed are negative
  availableCents Int?
  source SnapshotSource          // PROVIDER | STATEMENT | MANUAL | COMPUTED
  @@unique([accountId, asOfDate, source])
}
```

Manual assets and debts are ordinary `FinancialAccount`s (`OTHER_ASSET`, `LOAN`, `OTHER_LIABILITY`) with manual
snapshots, so net worth has one code path.

**Current balance** (`src/lib/accounts.ts`, `src/server/services/accounts.ts`):

- Bank, card, loan and other accounts read `BalanceSnapshot`; investment accounts read `PortfolioValuation` (total =
  `marketValueCents + cashCents`), never both. Forms ask for an investment account's total and the part of it that is
  cash, so cash cannot be added on top of a total that already includes it.
- The current balance is the entry with the latest `asOfDate`; on the same date STATEMENT beats PROVIDER beats MANUAL
  beats COMPUTED. An account with no entry has no balance (shown as missing, never as zero).
- Forms ask for the amount **owed** on liabilities and store it negative; a negative amount owed is a credit balance.
- A second MANUAL entry for the same date replaces the first. Only MANUAL entries can be removed in the app.
- Once anything is recorded for an account it can only be archived, not deleted, and its type can only change between
  CHECKING, SAVINGS and CASH (an investment account's kind is fixed). Archived accounts keep their history and are
  read-only; current totals and Safe to Spend leave them out.

## Cash transactions (bank and credit card accounts)

```prisma
model Transaction {
  id, userId, accountId
  date @db.Date, authorizedDate @db.Date?
  amountCents Int                 // signed, owner's net-worth view (see Integrity rules): negative = less money
  description String              // raw text, never edited
  merchantId?
  kind TxnKind                    // INCOME | EXPENSE | REFUND | TRANSFER | CREDIT_CARD_PAYMENT
                                  // | INVESTMENT_CONTRIBUTION | INVESTMENT_WITHDRAWAL | ADJUSTMENT
  status TxnStatus                // PENDING | POSTED
  reviewStatus ReviewStatus       // NEEDS_REVIEW | CONFIRMED
  categorySource CategorySource   // RULE | MERCHANT_MEMORY | PROVIDER | MANUAL | NONE
  appliedRuleId?, incomeSourceId?
  recurringSeriesId?              // set when matched to a recurring bill/income occurrence (Safe to Spend "paid")
  contributionPlanId?             // set when matched to a contribution plan (planned vs actual)
  excludeFromBudget Boolean @default(false)
  notes String?
  transferPairId String?          // both legs of a transfer / card payment / investment contribution share it
  externalId String?, pendingExternalId String?
  fingerprint String              // CSV dedupe key (see below)
  importBatchId?
  raw Json                        // original row or payload
  splits TransactionSplit[]
  @@unique([accountId, externalId]) @@unique([id, userId])
  @@index([userId, date]) @@index([userId, reviewStatus]) @@index([accountId, fingerprint])
  @@index([recurringSeriesId]) @@index([contributionPlanId])
}

model TransactionSplit {          // >= 1 per transaction, sum == amountCents
  id, userId, transactionId
  categoryId?                     // null until categorized; always null for transfers, card payments, contributions
  amountCents Int, note?
  @@index([userId, categoryId])
}
model Category  { id, userId, name, parentId?, type CategoryType /* EXPENSE | INCOME */, isEssential Boolean, color, sortOrder, archivedAt
                  @@unique([id, userId]) /* + unique (userId, parentId, name) NULLS NOT DISTINCT */ }
model Merchant  { id, userId, name, matchKey, defaultCategoryId?; @@unique([userId, matchKey]) }
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
  cashAmountCents Int              // total signed effect on the account's USD cash, fees included
                                   // (0 for crypto-to-crypto legs); feeCents breaks the fee out
  usdValueCents Int?               // fair USD value of this leg at trade time; required when there is no USD cash
                                   // leg (crypto-to-crypto trades, staking rewards, transfers in) so cost basis works
  usdValueSource ValuationSource?  // PROVIDER | PRICE_HISTORY | MANUAL
  feeCents Int @default(0), feeAssetId?, feeQuantity Decimal(38,18)?
  groupRef String?                 // links legs of one event (Kraken ledger refid, crypto-to-crypto trades)
  linkedCashTransactionId?         // the bank leg of a deposit/withdrawal
  contributionTaxYear Int?         // IRA deposits: the tax year the contribution counts toward
  externalId?, fingerprint, importBatchId?, raw Json
  @@unique([accountId, externalId])
  @@index([accountId, tradeDate]) @@index([userId, assetId])
}

model HoldingSnapshot {            // positions as reported or computed at a date
  id, userId, accountId, assetId, asOfDate @db.Date
  quantity Decimal(38,18), costBasisCents Int?, priceUsed Decimal(24,10)?, marketValueCents Int?
  source SnapshotSource
  @@unique([accountId, assetId, asOfDate, source])
}

model PortfolioValuation {         // total account value at a date; never interpolated
  id, userId, accountId, asOfDate @db.Date, marketValueCents Int, cashCents Int, source SnapshotSource
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
model ContributionAllocation { id, userId, planId, targetAccountId, share Decimal(7,6) }   // e.g. 0.7 / 0.3; sum to 1
model ContributionOverride   { id, userId, planId, scheduledDate @db.Date, amountCents Int?, skip Boolean, note?
                               @@unique([planId, scheduledDate]) }
```

Planned targets are computed, never stored:

- `FIXED_AMOUNT`: the amount on each scheduled date.
- `PERCENT_OF_PAYCHECK`: percent x each matched paycheck, on that payday.
- `PERCENT_OF_INCOME`: percent x income received in the contribution period `(previousDate, scheduledDate]`. This works
  for any pairing (weekly contributions with biweekly pay, monthly with semimonthly, ...); some periods may be $0.

Each target is `max(minimum, round_half_even(x))`, then an override replaces it or skips it, and it is split across
allocations with largest-remainder rounding so the parts sum exactly. Paused plans and deleted plans produce no targets
(history of actual contributions is kept). Actual = `INVESTMENT_CONTRIBUTION` transactions from `sourceAccountId` to an
allocation's account, matched to a target period and stamped with `Transaction.contributionPlanId` (so several plans
never claim the same transfer), and linked to the investment account's `DEPOSIT` via `transferPairId` /
`linkedCashTransactionId` so the money is counted once. Contributions into a Roth IRA are contributions, never
expenses.

## Budgets, recurring items, goals, forecasts, net worth

```prisma
model Budget           { id, userId, month @db.Date /* first of month */, categoryId, amountCents, rollover Boolean; @@unique([userId, month, categoryId]) }
model RecurringSeries  { id, userId, name, merchantId?, accountId, categoryId?, kind, expectedAmountCents, toleranceCents,
                         schedule Json, nextExpectedDate @db.Date, status /* SUGGESTED | ACTIVE | DISMISSED */ }
model SavingsGoal      { id, userId, name, targetCents, targetDate @db.Date?, linkedAccountId?, monthlyTargetCents?,
                         priority Int, status /* ACTIVE | PAUSED | COMPLETED | ARCHIVED */ }
model GoalLedgerEntry  { id, userId, goalId, accountId, date @db.Date, amountCents Int /* signed */, type /* ALLOCATE | RELEASE | WITHDRAW */, note?
                         @@index([goalId]) @@index([accountId]) }
model ForecastScenario { id, userId, name, baseline /* HISTORICAL | BUDGET */, lookbackMonths, contributionPercentOverride Decimal(7,6)?,
                         categoryAdjustments Json, marketGrowthAnnual Decimal(7,6)? /* null = no growth */, includeGoals Boolean }
model NetWorthSnapshot { userId, asOfDate @db.Date, assetsCents, liabilitiesCents, cashCents, investmentsCents, otherAssetsCents,
                         completeness Json /* accounts missing data for that date */; @@id([userId, asOfDate]) }
```

- **Budget hierarchy:** budgets may be set on a parent or a child category, but within one month a category can have a
  budget only if none of its ancestors or descendants does. A parent's spending includes its children, so totals never
  count the same dollar twice.
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
  available balance of accounts with includeInSafeToSpend
- their minimum balances                       (if applyCushion)
- recurring bills due in the horizon and not yet paid (occurrences with no transaction matched via recurringSeriesId)
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

Because amounts are signed (purchases negative, refunds positive), living expenses for a period are reported as a
positive number: `spending = -(sum of the signed EXPENSE and REFUND splits)`. A refund larger than the month's purchases
in a category correctly yields negative spending for that category.
