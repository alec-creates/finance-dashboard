# TASKS

Roadmap and progress. One task at a time; the app stays working after each. Legend: `[x]` done, `[ ]` planned.

## Milestones

The roadmap passes three separate gates. Reaching one does not imply the next.

| Milestone                            | Reached after                     | Means                                                                                                                                                                |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Technical deployment**          | Task 8                            | Production runs on Vercel + Neon over HTTPS. It is in a **testing state**: a visible banner, invented test data only, **no real financial data**.                    |
| **B. Ready for real financial data** | Task 9 + the gate checklist below | Authentication, authorization, backup and recovery, and the CSV import workflow are validated on production, and the owner signs off. Real data may now be imported. |
| **C. Usable MVP**                    | Task 12                           | The daily loop works with real data: import bank and card CSVs, review and categorize, track budgets, see the overview on phone and desktop.                         |

Roadmap revised on 2026-10-26 to reach a usable MVP sooner. Old Tasks 7 (categories) and 8 (manual transactions) are now
Task 7. Old Task 9 (dashboard) is now Task 12. Old Task 10 is split into Task 8 (production deploy) and the Phase 7
public demo. A minimal CSV import with backup and recovery (Task 9), the review queue (Task 10) and basic budgets
(Task 11) moved up from Phases 2, 3 and 7. Their remaining features stay in those phases.

## Phase 1 - Foundation and MVP

Goal: a production deployment that handles real financial data safely, and a usable MVP. That means accounts,
transactions and categories, CSV import with tested recovery, a review queue, monthly budgets and an overview
dashboard, all responsive on phone and desktop at $0 recurring cost.

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
- [x] **5. App shell (trimmed)**: shadcn/ui, responsive navigation, light/dark mode, consistent auth pages,
      placeholder pages
  - Acceptance:
    - shadcn/ui is set up for Tailwind 4, and only the components in use are added.
    - Navigation covers Overview, Transactions, Budgets, Accounts and Settings: a sidebar on desktop, a bottom tab bar
      on phones. The current page is marked visually and with `aria-current`.
    - Theme follows the system by default. A manual toggle (light / dark / system) is remembered, with no flash of the
      wrong theme on load.
    - Sign-in, two-factor, setup and 2FA setup pages use the same components and theme as the app.
    - Each unfinished section has a placeholder page that requires a signed-in user with 2FA (`requireUser()` inside
      `<Suspense>`).
    - Keyboard: a skip link to the main content, every control reachable with Tab, visible focus, menus closable with
      Escape.
    - No horizontal scrolling at 375 px wide; works at desktop widths.
    - `npm run check` and `npm run build` pass.
  - Deferred: the PWA manifest and icons move to Task 8 (installing needs HTTPS); PWA polish stays in Phase 7.
  - Done (2026-10-26): shadcn/ui 4.22 (Radix base, Nova preset) with clsx + tailwind-merge; sidebar from 768 px, bottom
    tab bar below; theme script tested by executing it against a fake DOM; placeholders for Transactions, Budgets and
    Accounts; Settings with appearance and security. Checked in a browser at 375 px and 1280 px, light and dark,
    keyboard only (skip link, menus, Escape), sign-out from the account menu.
- [x] **6. Accounts**: create, edit and archive accounts of every type, with manual balance snapshots
  - Acceptance:
    - Account types: checking, savings, credit card, investment (with its type: taxable, Traditional IRA, Roth IRA,
      crypto, other), other asset, other liability.
    - Inputs are validated with Zod; amounts are parsed to cents through `money.ts`; services check ownership and take
      `userId` only from the session.
    - Optional minimum balance. Manual balance snapshots carry an as-of date. The list shows the latest balance and when
      it was last updated.
    - Archiving hides an account but keeps its history.
    - Liability balances follow the sign convention in `docs/data-model.md`.
    - The Overview lists real balances.
    - Unit and integration tests, including that another user's account id is rejected.
  - Done (2026-10-26): accounts list grouped by kind (cash, credit cards, investments, other assets, loans) with
    group totals that report missing balances instead of treating them as zero; add/edit forms with Zod validation;
    detail page with current balance, balance updates, history (manual entries removable), archive/restore, and
    delete only for accounts with no history. Investments use portfolio valuations (total = holdings + cash).
    Liabilities are entered as amounts owed. Type changes are limited once history exists. 41 unit tests, 18
    integration tests including cross-user reads, edits, archives, deletes and balance writes (verified to fail
    when ownership scoping is removed). Checked in a browser at 375 px and 1280 px.
  - Review fixes: a field's validation error clears once it (or a field it depends on) is edited, while every submit
    is still validated on the server; replacing a same-day manual balance shows the existing value and needs an
    explicit confirmation bound to that date, enforced by the server (4 unit and 2 integration tests added).
  - Known minor follow-ups: account history shows the latest 60 entries without pagination; Server Actions have no
    tests of their own (ownership is tested in the service layer they call).
- [x] **7. Transactions and categories**: starter categories, a transaction list, manual entry with kind and splits
  - Acceptance:
    - A new user gets an editable starter set of two-level categories with an essential flag. Categories can be
      added, renamed and archived.
    - The transaction list can be filtered by month and account and shows kind, category and amount. Monthly income
      and spending totals are computed from `kind`, never from category.
    - Manual create and edit with a kind and one or more splits. The splits must sum exactly to the amount, enforced
      in the form, the service and the database.
    - Tests cover refunds, transfers and card payments (excluded from income and spending), multi-split rounding and
      ownership.
  - Done (2026-10-26): starter categories (8 groups, 20 subcategories) created once per owner; category page to add,
    rename, mark essential, archive and restore. Transactions page with month navigation, account filter, income /
    spending / net totals by kind and a "not counted" note. Manual add/edit/delete with all eight kinds, money-in/out
    for movements, uncategorized or split across up to 20 categories (divide evenly to the cent, live remaining
    amount). The service re-checks signs, split sums, category ownership/type/archival and account ownership; imported
    rows are read-only. 29 unit and 18 integration tests (card purchase vs payment, refunds, transfers, splits,
    month boundaries, editing, archived categories, untouched balance snapshots, cross-user accounts, categories and
    transactions; verified to fail when category scoping is removed). Checked in a browser at 375 px and 1280 px.
  - Review fix: the default month is the owner's local month. The browser reports its IANA time zone in a cookie and
    the server renders with it (a saved setting would win; invalid values fall back to UTC); stored dates are unchanged.
    6 unit tests (month and year boundaries, positive, negative and half-hour offsets, daylight saving, invalid zones)
    and 1 integration test.
  - Follow-ups: transfer and card-payment legs are not linked (Task 10 pairing); a time zone setting in Settings is
    still to come (the browser's zone is used until then); no search or pagination within a month (Phase 2); Server
    Actions have no tests of their own (the services they call are tested).
- [ ] **8. Production deploy** (milestone A: technical deployment): Vercel Hobby + Neon production project, PWA basics,
      testing state
  - Acceptance:
    - A `finance-dashboard-prod` Neon project exists, with credentials only in Vercel Production environment
      variables. Preview deployments get no production credentials.
    - Migrations reach production only through the guarded wrapper, and only with `migrate deploy`, from the manually
      started, approval-protected `Release production` workflow after a database identity check (ADR-0011).
      Application builds never migrate.
    - `BETTER_AUTH_URL` is the production URL. The owner account and 2FA are created on production.
    - Checked on the production URL:
      - the session cookie is `__Secure-` and `Secure`;
      - a POST from a foreign origin is rejected;
      - signed-out pages redirect and APIs return 401;
      - security headers are present;
      - rate-limit rows are keyed by the real client IP.
    - The PWA manifest and icons make the app installable on a phone.
    - A Playwright smoke test (sign in -> 2FA -> overview -> every navigation section -> sign out) runs against the
      test database. A signed-out visit to every section redirects to sign-in.
    - **Testing state:** production shows a persistent "Testing - do not enter real financial data" banner until gate B
      is signed off. Only invented test data may be entered.
  - Progress (2026-10-26), code ready: release workflow with preflight, `migrate deploy` and postflight, then a Vercel
    deploy hook; production-only database guard (workflow, `main`, direct connection, fingerprint, failed/unknown
    migrations); `vercel.json` stops automatic `main` deploys; runtime checks that keep each deployment on its own
    database; testing banner; PWA manifest and icons; Playwright smoke tests (desktop and phone); guard tests for the
    deployment configuration; `docs/deployment.md` and ADR-0011.
  - Remaining (owner, then checks): create the Neon production project, the Vercel project and the GitHub
    `production` environment (docs/deployment.md); run `status`, then the first `release`; confirm the deploy hook
    creates a Production deployment; create the owner account and 2FA on production; run the production checks above.
- [ ] **9. CSV import and backup/recovery**: a minimal import pipeline plus a documented, tested recovery procedure
  - CSV import acceptance:
    - Upload (size-limited, parsed on the server) -> column mapping -> preview with per-row errors -> confirm -> report
      (imported / duplicates skipped / errors).
    - Mapping covers date (selectable format), description, a single amount or separate debit and credit columns,
      optional external id and balance. The sign convention is per account.
    - Saved import profiles, including a generic one. Profiles for the owner's institutions are built locally from
      header rows and never committed.
    - Raw rows are stored with the import batch as immutable history.
    - Amounts go through `money.ts`, dates through `dates.ts`.
    - Duplicate detection uses the external id when present, otherwise a fingerprint (account, date, amount, normalized
      description, occurrence). Re-importing the same file imports nothing.
    - An entire import batch can be undone.
    - Imported transactions start unreviewed, with a provisional kind from the amount's sign.
    - Parser unit tests use synthetic fixtures (quoted commas, BOM, CRLF, debit/credit columns, parenthesized
      negatives, thousands separators). Integration tests cover import -> duplicate re-import -> undo.
  - Backup and recovery acceptance:
    - The owner can download a full export of their data as versioned JSON (schema version, export time, row counts,
      raw import rows).
    - `docs/backup-and-restore.md` documents the full backup: `pg_dump` (free client tools) from the owner's machine,
      stored outside the repository in an encrypted location. It also documents restore with `pg_restore` into a
      separate, empty, non-production database, and a backup cadence (after each import session, at least weekly).
    - The restore drill is scripted and tested: a dump of the development (synthetic) database is restored into the test
      database, and row counts and per-account totals match. The script refuses production as a restore target.
    - Limitations are documented. If JSON restore is not implemented, the JSON export is for portability and inspection
      only, and recovery uses the database dump. Neon Free keeps only 6 hours of restore history. Backups contain real
      data once gate B is passed.
- [ ] **Gate B: ready for real financial data** (milestone B). All on production, before any real data is entered:
  - [ ] Authentication validated: owner-only sign-up, password + mandatory 2FA, lockout, rate limits, sign-out
        everywhere, `__Secure-` cookies, foreign origins rejected.
  - [ ] Authorization validated: every page and API route requires a session with 2FA (Playwright route sweep), and
        integration tests show no cross-user access.
  - [ ] Backup and recovery validated: a production backup is restored into a non-production database and verified,
        following the documented procedure.
  - [ ] CSV import validated on production with synthetic files: preview, mapping, duplicate re-import, undo.
  - [ ] Invented test data removed from production; testing banner turned off.
  - [ ] Owner sign-off recorded here with the date.
- [ ] **10. Review queue and categorization rules**: mobile-first review, rules, merchant memory, simple pairing
  - Acceptance:
    - The Needs Review queue lets the owner confirm, change category or kind, split or exclude. "Apply to future"
      creates a rule.
    - Merchant memory suggests the last confirmed category for a normalized merchant.
    - Rules match description text, account and amount sign; they set category and kind and have priorities.
    - Rules apply only to unreviewed transactions, unless the owner re-applies them after a preview (financial rule 6).
    - Pairing suggestions: equal and opposite amounts between the owner's accounts within a few days. Confirming marks
      both sides `TRANSFER` or `CREDIT_CARD_PAYMENT`.
    - Tests show that confirmed transfers and card payments drop out of income and spending totals.
- [ ] **11. Budgets (basic)**: monthly budgets per category with progress
  - Acceptance:
    - Budget amount per category per month; copy the previous month forward.
    - Progress shows spent vs budget per category: expense splits minus refund splits in that month, transfers and card
      payments excluded. Colors are green / yellow / red, with editable default thresholds.
    - Unbudgeted spending and a month selector.
    - Tests cover refunds, split transactions across categories, month boundaries in the user's time zone, and
      excluded kinds.
- [ ] **12. Overview dashboard and E2E** (milestone C: usable MVP)
  - Acceptance:
    - The widget registry and a responsive grid render one code-defined default layout (ADR-0005).
    - Widgets: cash balances, credit card balances, this month's income and spending (by kind), budget progress,
      needs-review count, recent transactions.
    - Every widget has an empty state and shows its as-of date.
    - Playwright critical path: sign in -> import a synthetic CSV -> review a transaction -> see it in budgets and on
      the overview.
    - Works at 375 px wide and at desktop widths.
  - Milestone C is reached when one month of real bank and card data has been imported, reviewed and budgeted, and
    each account's month-end balance matches its statement.

## Phase 2 - Imports, categorization, review

Minimal versions of the CSV pipeline, duplicate detection, rules, merchant memory, review queue and pairing ship in
Tasks 9-10. The items below are the remaining scope.

- [ ] CSV import pipeline: upload -> column mapping -> preview -> confirm -> report; saved import profiles (minimal in
      Task 9; remaining: QFX/OFX import if an institution offers no CSV, import history view)
- [ ] Import profiles for the owner's bank and credit card (built from real header rows, never committed), plus a
      generic profile (Task 9)
- [ ] Duplicate detection (externalId, fingerprint, near-match review) and import undo (externalId, fingerprint and
      undo in Task 9; remaining: near-match review)
- [ ] Merchant normalization, categorization rules with priorities, merchant memory (rules and memory in Task 10;
      remaining: merchant normalization and editing)
- [ ] Needs Review queue (mobile-first): confirm, change, split, exclude, "apply to future" (Task 10)
- [ ] Transfer and card-payment pairing suggestions (simple version in Task 10; remaining: better matching, unpairing)
- [ ] Transaction search and filters, CSV export
- [ ] JSON restore from the Task 9 export, if not implemented there

## Phase 3 - Budgets, income, recurring

- [ ] Monthly budgets per category with per-month amounts, copy forward, optional rollover (basic budgets in Task 11;
      remaining: rollover)
- [ ] Budget progress (green/yellow/red), previous-month comparisons, in-app alerts (progress in Task 11; remaining:
      comparisons, alerts)
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
- [ ] PWA polish, offline-friendly shell, mobile performance (manifest and icons in Task 8)
- [ ] Wider E2E coverage, accessibility pass
- [ ] Data export (JSON/CSV) and delete-imported-data tools; documented backup script (JSON export and backup/restore
      in Task 9; remaining: CSV export, delete-imported-data tools)
- [ ] Public demo deployment with synthetic data; screenshots (a separate Vercel project and Neon database, never
      production; split from old Task 10)
- [ ] README: architecture, data model, testing strategy, calculation methodology

## Open questions

Owner-specific open questions (export formats, account details) are tracked in the local, gitignored
`private/owner-setup.md`.
