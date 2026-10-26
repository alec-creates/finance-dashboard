# 0001. Stack and $0 hosting

- Status: Accepted; the local database setup is superseded by ADR-0008
- Date: 2026-10-25

## Context

A solo developer needs one codebase usable from Windows, iPhone and Android, synchronized through a database, with
hosting and database costs of $0. Docker is not installed locally.

## Decision

- **Next.js 16 (App Router) + TypeScript strict** for UI and server code (Server Actions, route handlers); no separate
  backend service.
- **PostgreSQL on Neon Free + Prisma.** Local development and integration tests use Neon branches (`dev`, `test`)
  instead of Docker.
- **Vercel Hobby** for hosting, installed on phones as a **PWA**.
- **Better Auth** with a single allowlisted email, no public sign-up, and a second factor.
- A separate Vercel project + Neon project serves the public demo with synthetic data only.

Plan limits checked on 2026-10-25 (re-check before relying on them):

- Neon Free: 0.5 GB storage and 100 CU-hours per project per month, compute scales to zero after 5 minutes idle,
  10 branches per project. Compute suspends if the monthly quota is exhausted.
- Vercel Hobby: personal, non-commercial use; cron jobs run at most once per day with hourly precision.

## Consequences

- Single-user data volume (tens of MB per year) fits Neon Free with large headroom.
- Neon cold starts add some latency to the first request after idle.
- Background sync is limited to a daily cron plus on-demand refresh when the app opens.
- Neon Free's restore window is short, so the app must provide its own data export, and backups are documented as a
  user-run `pg_dump` to local disk.
- If either provider changes its free plan, we revisit this ADR before paying for anything.

## Amendment (2026-10-26)

- Neon's Free plan, re-checked on its own pages: 100 projects, 10 branches per project, **1 GB storage per project**
  (20 GB per account), 100 CU-hours per project per month, scale to zero after 5 minutes, **6 hours** of restore
  history, no credit card required. Reaching a limit suspends compute or blocks writes; no data is deleted.
- Development and test now use separate Neon projects instead of branches of one project (ADR-0008).
