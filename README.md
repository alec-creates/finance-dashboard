# Finance Dashboard

A personal finance web app for budgeting, transaction review, income tracking, investments, net worth, savings goals,
Safe to Spend and transparent forecasting. Built as a daily-use tool and as a portfolio project demonstrating
full-stack engineering, testing and data analysis practices.

> **Status:** Phase 1 (foundation) in progress. See [TASKS.md](TASKS.md).
>
> This repository contains **no real financial data**. All fixtures, seeds, demos and screenshots use synthetic data.

## Highlights (planned)

- Bank, credit card, brokerage and crypto accounts in one place (CSV import first, free read-only sync where available)
- Review queue with rule-based categorization, split transactions and merchant memory
- Monthly budgets, income analytics for biweekly pay, recurring bills
- Investment holdings, gains, contribution targets (fixed or a percentage of income) and net worth history
- Savings goals, Safe to Spend, and 1/3/6/12-month forecasts with scenarios and visible methodology
- Responsive, installable (PWA) on desktop and phone

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · Recharts · Prisma ·
PostgreSQL (Neon) · Better Auth · Zod · Vitest · Playwright · Vercel

## Getting started

Prerequisites: Node.js 22+ and npm. Docker is not required: development and tests each use their own free Neon
Postgres project (ADR-0008).

```bash
npm install            # also generates the Prisma client
npm run db:check-env   # validates .env.local / .env.test.local without printing values
npm run db:migrate     # applies migrations to the development database
npm run db:seed        # loads 18 months of synthetic data
npm run dev
```

Open http://localhost:3000.

Configuration: create `.env.local` (development) and `.env.test.local` (tests) from `.env.example`. Both are
gitignored; never commit them. The repository and its seed contain synthetic data only.

Testing: `npm test` runs unit tests (also in CI). `npm run test:integration` runs database tests against the test
database only; it refuses to start unless `DATABASE_ENV=test` and the test database differs from development.

## Scripts

| Script                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Development server                               |
| `npm run build`         | Production build                                 |
| `npm run check`         | Prettier check, ESLint, typecheck and unit tests |
| `npm test`              | Unit tests (Vitest)                              |
| `npm run test:coverage` | Unit tests with coverage report                  |
| `npm run format`        | Format the codebase                              |

CI (GitHub Actions) runs the same checks plus a production build and a secret scan on every push and pull request.

## Documentation

- [CLAUDE.md](CLAUDE.md): architecture, conventions and correctness rules
- [docs/data-model.md](docs/data-model.md): schema design for all phases
- [docs/integrations.md](docs/integrations.md): integration research per institution
- [docs/adr/](docs/adr/): architecture decision records

Sections on architecture, testing strategy and calculation methodology will be expanded as features land.
