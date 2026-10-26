# TASKS

Roadmap and progress. One task at a time; the app stays working after each. Legend: `[x]` done, `[ ]` planned.

## Phase 1 - Foundation

Goal: authenticated, responsive app with the full schema, synthetic data, accounts of every type, manual transactions
and a polished default dashboard built from reusable widgets, deployed with synthetic data.

- [x] **1. Project setup and tooling**: Next.js 16 + TS strict, Tailwind, ESLint + Prettier, Vitest, CI (checks +
      secret scan), `.gitignore` for secrets and financial files, CLAUDE.md, TASKS.md, README, ADRs, data model and
      integration research
- [x] **2. Core numeric and scheduling utilities**: `money.ts` (cents, parse/format, half-even rounding, percent,
      prorate, largest-remainder allocation), `decimal.ts` (quantities, prices, rates), `investments.ts` (market value, unit cost, gains), `percent.ts`
      (fractions, shares, ratios), `dates.ts` (calendar dates, months, time zones), `schedules.ts` (weekly, biweekly,
      semimonthly, monthly, every N days/months, weekend adjustment), `contributions.ts` (fixed / % of income /
      % of paycheck targets, splits); unit tests; test run fails if a required suite is missing
- [x] **3. Database**
  - [x] Design review: 11 fixes applied to `docs/data-model.md` (ADR-0009); isolated environments (ADR-0008)
  - [x] Local env files with placeholders (gitignored) and `npm run db:check-env`
  - [x] Owner creates Neon projects `finance-dashboard-dev` and `finance-dashboard-test` and fills in the env files;
        `npm run db:check-env` and `npm run db:check-connection` pass (2026-10-26)
  - [x] Prisma 7.10.1 (pinned) with the pg adapter, `prisma.config.ts`, 33-table schema with composite ownership
        relations, 40 CHECK constraints, deferred split-sum and allocation-share triggers; `init` migration applied
        to development (test database migrated by the integration suite with `migrate deploy`)
  - [x] Env validation (Zod), guarded Prisma wrapper (`scripts/db.ts`), test-database guard (`DATABASE_ENV=test`,
        host differs from development), redacted Prisma output
  - [x] Deterministic synthetic data generator (18 months: checking, savings, card, taxable brokerage, Roth IRA and
        crypto; biweekly pay with 3-paycheck months; weekly and monthly contributions); dev seeded
  - [x] Integration tests (31): isolation, ownership, constraints, deferred invariants, delete behaviour, precision,
        synthetic dataset integrity
- [x] **4. Authentication** (ADR-0010): Better Auth 1.7.13; owner-only sign-up and sessions via `OWNER_EMAIL`
      hooks; password (12+ chars, breach check) + mandatory TOTP 2FA with backup codes and account lockout; 7-day
      database sessions, sign-out and sign-out-everywhere; database-backed rate limits; Next.js 16 proxy plus
      server-side `requireUser()` / `requireApiUser()`; `/setup`, `/sign-in`, `/two-factor`, `/security/two-factor`,
      `/settings/security`; protected `GET /api/accounts`; unit, proxy and integration tests (owner-only sign-up,
      sessions, logout, expiry, 2FA, rate limits, lockout, API authorization)
- [ ] **5. App shell**: shadcn/ui, mobile bottom tabs / desktop sidebar, light/dark, PWA manifest and icons
- [ ] **6. Accounts**: create/edit/archive accounts of every type (checking, savings, credit card, investment with
      type, other assets/liabilities), optional minimum balance, manual balance snapshots, "last updated"
- [ ] **7. Categories**: two-level categories, essential flag, editable starter set
- [ ] **8. Manual transactions**: create/edit with kind and splits; split-sum invariant enforced and tested
- [ ] **9. Basic dashboard**: widget registry + responsive grid renderer + code-defined default layouts for mobile and
      desktop (ADR-0005); first widgets: cash balances, card balances, income and spending this month, spending by
      category, recent transactions
- [ ] **10. E2E and deploy**: Playwright critical path (sign in -> add transaction -> see it on dashboard); deploy to
      Vercel Hobby with synthetic data

## Phase 2 - Imports, categorization, review

- [ ] CSV import pipeline: upload -> column mapping -> preview -> confirm -> report; saved import profiles
- [ ] Import profiles for the owner's bank and credit card (built from real header rows, never committed), plus a
      generic profile
- [ ] Duplicate detection (externalId, fingerprint, near-match review) and import undo
- [ ] Merchant normalization, categorization rules with priorities, merchant memory
- [ ] Needs Review queue (mobile-first): confirm, change, split, exclude, "apply to future"
- [ ] Transfer and card-payment pairing suggestions
- [ ] Transaction search and filters, CSV export

## Phase 3 - Budgets, income, recurring

- [ ] Monthly budgets per category with per-month amounts, copy forward, optional rollover
- [ ] Budget progress (green/yellow/red), previous-month comparisons, in-app alerts
- [ ] Income sources with configurable pay schedules; paycheck detection; next payday projection
- [ ] Income analytics: this/last month, 3/6-month averages, average paycheck, high/low, trend; incomplete months
      excluded
- [ ] Recurring expense detection with confirmation; upcoming bills

## Phase 4 - Investments, contributions, net worth

- [ ] Investment account types: taxable brokerage, Traditional IRA, Roth IRA, crypto exchange, other (ADR-0007)
- [ ] Brokerage import: Webull order-history CSV format, manual holdings snapshots, dividends/deposits/withdrawals
- [ ] Crypto exchange import: Kraken ledger + trades CSV format (API comes in Phase 6)
- [ ] Price history: exchange public prices for crypto; free EOD source for stocks (choose after checking terms)
- [ ] Holdings, cost basis, unrealized and realized (FIFO, complete-history only) gains; breakdown by account type,
      asset class and holding
- [ ] Contribution plans (ADR-0006): weekly / biweekly / semimonthly / monthly / custom schedules; fixed, % of income
      or % of paycheck (editable default percentage); split across accounts; minimums, overrides, pause, edit, delete; planned vs
      actual
- [ ] Monthly cash-flow summary: income, expenses, contributions, cash remaining, contribution rate
- [ ] Net worth page: current, history, monthly change split into cash flow / contributions / market, allocation;
      no interpolated valuations

## Phase 5 - Goals, Safe to Spend, forecasting

- [ ] Savings goals with ledger allocations, no double counting, estimated completion
- [ ] Safe to Spend: user-chosen spending accounts, per-account minimum balance, cushion on/off, horizon (next
      payday / end of month / N days), bills, essential spending, planned investments and goals; explained breakdown;
      expected income excluded
- [ ] Forecast engine: projected paydays, average take-home per paycheck, recurring bills, discretionary averages,
      contributions, goals; 1/3/6/12 months; cash balance and net worth projections
- [ ] Scenarios: Current Habits, Follow My Budget, Increase Investments, Reduce Spending; interactive assumptions;
      optional market growth (default none)
- [ ] Methodology panel on every forecast
- [ ] Widgets for income, investments and planning (next paycheck, portfolio values, contribution progress, net worth,
      goals, Safe to Spend, projected savings)

## Phase 6 - Free automatic integrations

- [ ] Provider adapter framework, encrypted credential storage, sync status UI
- [ ] Kraken read-only API (permission check rejects keys with trade/deposit/withdraw)
- [ ] Plaid Trial for bank and credit card accounts: verify each institution in Plaid Link first; linking, sync,
      pending -> posted, re-auth
- [ ] Daily cron (Vercel Hobby limit) plus refresh on app open

## Phase 7 - Customization, polish, portfolio

- [ ] Dashboard customization (ADR-0005): add, remove, reorder, resize presets, widget settings, separate mobile and
      desktop layouts saved in the database, restore default
- [ ] PWA polish, offline-friendly shell, mobile performance
- [ ] Wider E2E coverage, accessibility pass
- [ ] Data export (JSON/CSV) and delete-imported-data tools; documented backup script
- [ ] Public demo deployment with synthetic data; screenshots
- [ ] README: architecture, data model, testing strategy, calculation methodology

## Open questions

Owner-specific open questions (export formats, account details) are tracked in the local, gitignored
`private/owner-setup.md`.
