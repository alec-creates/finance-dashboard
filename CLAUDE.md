# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

@AGENTS.md

## What this is

A personal finance dashboard for a single user (designed so more users can be added later without a rewrite):
budgets, transaction review, income, investments, net worth, savings goals, Safe to Spend, forecasting and a
customizable dashboard. It is used daily with real data **and** is a public portfolio project, so the repository
must never contain real financial data, secrets, or details that identify the owner's finances.

The owner's real setup (institutions, pay schedule, contribution habits) is recorded in `private/owner-setup.md`, a
local, gitignored file. Read it when a task depends on it (e.g. writing a CSV adapter), but never copy its contents
into tracked files. Public docs, tests and fixtures speak generically ("a bank", "a brokerage") and use invented
amounts.

Priorities, in order: **financial correctness → security/privacy → maintainability → visual polish.**

## Stack

| Concern    | Choice                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| App        | Next.js 16 (App Router), React 19, TypeScript strict                      |
| UI         | Tailwind CSS 4, shadcn/ui, Recharts                                       |
| Data       | PostgreSQL on Neon (free plan), Prisma ORM                                |
| Auth       | Better Auth: single allowlisted user, no public registration, 2FA/passkey |
| Validation | Zod at every boundary (forms, CSV rows, provider payloads, env)           |
| Tests      | Vitest (unit + integration), Playwright (E2E)                             |
| Hosting    | Vercel Hobby (free) + Neon Free; PWA for phone install                    |

Next.js 16 differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before using a
framework API you have not used in this repo yet.

## Architecture

```
src/
  app/            Routes, layouts, Server Actions (thin: parse input -> call a service -> return)
  components/     UI components (no data access); dashboard widgets + widget registry (ADR-0005)
  server/         Server-only code
    db/           Prisma client
    services/     Business logic; the ONLY layer that touches the database. Every query is scoped by userId.
    integrations/ Provider adapters behind one interface (CSV, Kraken, Plaid, ...)
  lib/            Pure, framework-free logic: money, decimal, dates, categorization, forecasting math
    decimal.ts       Decimal constructor (half-even), safe input parsing, column normalization (quantity/price/rate)
    money.ts         USD cents: parse, format, add, multiply/percent, prorate, average, allocate (largest remainder)
    percent.ts       Percentages as 6-dp fractions, allocation shares, ratios, shares of a total
    investments.ts   Market value, average unit cost, unrealized gain
    dates.ts         CalendarDate / YearMonth, month math, time zones, database DATE boundary
    schedules.ts     Recurring schedules for pay, contributions and bills (ADR-0006)
    contributions.ts Contribution targets (fixed, % of income, % of paycheck), splits, planned contributions
tests/            Integration and E2E tests, synthetic fixtures (tests/fixtures/), required-suite guard
docs/             Data model, integration research, ADRs (docs/adr/)
```

Rules:

- Pure calculations live in `src/lib` and are unit-tested without a database.
- Services take `userId` as an explicit argument and never trust an id from the client without checking ownership.
- Provider adapters implement a common interface; the rest of the app never knows which provider produced a row.

## Financial correctness rules (non-negotiable)

1. **USD amounts are integer cents** (`Int` columns, `number` in TS) and all arithmetic goes through `src/lib/money.ts`.
   Never use floating-point division on money; round explicitly (half-even) at defined boundaries.
2. **Quantities, prices and rates are decimals** (`Decimal` columns, `Prisma.Decimal` / decimal.js in TS): shares and
   crypto quantities `Decimal(38,18)`, unit prices `Decimal(24,10)`, FX rates `Decimal(24,12)`. Convert to cents only
   when producing a USD value, through one helper.
3. **Transaction dates are calendar dates** (`@db.Date`), interpreted in the user's time zone. Tests run with `TZ=UTC`.
4. **Every cash transaction has a `kind`**, and reports filter on kind, never on category:
   `INCOME`, `EXPENSE`, `REFUND`, `TRANSFER`, `CREDIT_CARD_PAYMENT`, `INVESTMENT_CONTRIBUTION`,
   `INVESTMENT_WITHDRAWAL`, `ADJUSTMENT`. Credit card purchases are spending when they occur; the card payment is not.
   Transfers and investment contributions are never income or spending.
5. **Categories live on splits.** Every transaction has at least one split, and splits sum exactly to the amount.
6. **Imported data is immutable history.** The raw row is stored; rule changes apply only to unreviewed transactions
   unless the user explicitly re-applies them (with a preview).
7. **No invented data.** Missing portfolio valuations are gaps, not interpolations. Forecasts are labelled as estimates
   and show their method. Future income is never treated as available cash.
8. **Read-only integrations.** Never request trading, withdrawal or transfer permissions. The app never moves money.
9. **Planned is not actual.** Contribution targets, bills and forecasts are computed plans; transactions are actuals.
   They are compared side by side, never mixed in one total.
10. **Investment accounts are typed** (taxable, Traditional IRA, Roth IRA, crypto, other). A retirement account is its
    own account even at the same broker; contributions to it are never expenses (ADR-0007).

## Configuration, not hardcoding

Never hardcode the owner's personal setup: bank names, accounts, categories, pay schedule, contribution amounts,
percentages or splits, the checking cushion, goals, or the dashboard layout. These are user-owned records and
preferences. Code may ship editable _defaults_ (a starter category set, a default dashboard layout, a suggested
contribution), but no logic may depend on a specific name or amount. Keep the app single-user with registration
disabled; do not build multi-user administration or subscriptions.

## Security and privacy rules

- Secrets only in `.env.local` (local) and Vercel project settings. `.env.example` lists names with empty values.
- Never commit real CSVs, statements, screenshots of real data, or database dumps (see `.gitignore`).
- Synthetic data only in fixtures, seeds, demos and screenshots. The public demo uses its own database.
- Never log balances, amounts with merchant names, account numbers, tokens or raw provider payloads.
- Provider credentials are encrypted at rest (AES-256-GCM, key from env) and never sent to the browser.
- Do not add a paid service or a paid tier without asking the user first.

## Conventions

- Names: domain terms from `docs/data-model.md` (e.g. `amountCents`, `asOfDate`, `kind`). Suffix cents fields `Cents`.
- Server Actions / route handlers validate input with Zod and return typed results; expected failures are values,
  not thrown errors.
- Prefer small modules and explicit types over clever abstractions. Do not add dependencies without a reason in the PR.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), one logical change each.
- Every architectural decision of lasting consequence gets an ADR in `docs/adr/`.

## Commands

| Command                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start the dev server on http://localhost:3000     |
| `npm run check`         | Format check, lint, typecheck, unit tests (CI)    |
| `npm run build`         | Production build                                  |
| `npm test`              | Run Vitest once (`npm run test:watch` to iterate) |
| `npm run format`        | Apply Prettier                                    |
| `npm run test:coverage` | Coverage report in `coverage/`                    |

## Development workflow

1. Work from `TASKS.md`; implement **one task at a time** and keep the app working after each.
2. Before coding: read the relevant docs (`docs/data-model.md`, ADRs) and existing code.
3. Write or update tests with the change; financial logic needs unit tests including edge cases. Register every new
   critical suite in `tests/required-suites.test.ts`; the run fails if a listed suite is missing, empty, or uses
   `.only`/`.skip`, and `npm run test:coverage` enforces 95% line coverage on `src/lib`.
4. Use the `src/lib` helpers instead of inline math: never `parseFloat`, `Number(amount)` or `/ 100` on money, and pass
   decimal values as strings (the helpers reject float inputs).
5. Run `npm run check` (and `npm run build` for route/config changes) before committing.
6. Update `TASKS.md`, and docs/ADRs when a decision changes. Then stop and summarize for review.

## Key documents

- `TASKS.md` - roadmap and progress
- `docs/data-model.md` - full schema design for all phases
- `docs/integrations.md` - verified integration options per institution
- `docs/adr/` - architecture decision records
