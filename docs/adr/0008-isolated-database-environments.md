# 0008. Isolated database environments: one Neon project each

- Status: Accepted (supersedes the "Neon branches for dev and test" part of ADR-0001)
- Date: 2026-10-26

## Context

Automated tests reset their database, and development uses synthetic data, while production will hold the owner's
real financial data. Branches inside one Neon project share roles and passwords, so a copied URL or a wrong host could
let one environment reach another. The Neon Free plan allows 100 projects, each with its own storage (1 GB) and compute
(100 CU-hours per month) allowance, at no cost.

## Decision

- Three separate Neon projects, each with its own credentials:
  - `finance-dashboard-dev`: local development, synthetic data only.
  - `finance-dashboard-test`: automated tests; may be wiped at any time.
  - `finance-dashboard-prod`: real data, created when deploying (Phase 1 Task 8), configured only in Vercel.
- Local configuration lives in gitignored files: `.env.local` (development) and `.env.test.local` (test). Next.js
  loads `.env.test.local` and skips `.env.local` when `NODE_ENV=test`, and test tooling uses the same loader.
- Each file sets `DATABASE_URL` (pooled, runtime), `DIRECT_URL` (direct, Prisma migrations) and `DATABASE_ENV`
  (`development` / `test` / `production`).
- Database tests and any reset helper refuse to run unless `DATABASE_ENV` is `test` and the database host differs from
  the development host.
- `npm run db:check-env` validates both files without printing any value; `npm run db:check-connection` also signs
  in to each database inside a rolled-back READ ONLY transaction and confirms the servers are different projects.
- Prisma is pinned to the stable 7.x line (7.10.1 at the time of writing); npm's `latest` tag currently points at an
  8.0 release candidate.

## Consequences

- A mistake in one file cannot reach another environment's data: the credentials are different.
- Two (later three) free projects to manage in the Neon Console.
- Neon Free keeps only 6 hours of restore history, so production backups rely on the app's export and a documented
  `pg_dump` with a tested restore drill (Phase 1 Task 9, required before real data: gate B in TASKS.md).
