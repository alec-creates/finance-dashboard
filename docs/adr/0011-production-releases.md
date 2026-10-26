# 0011. Production releases: manual, approved migrations before app deploys

- Status: Accepted
- Date: 2026-10-26

## Context

Production holds the owner's real financial data (once gate B is signed off). A schema change must never happen as a
side effect of building the app, must never run anything but `prisma migrate deploy`, and must land before the code
that depends on it. Credentials must not reach preview deployments, CI logs, the owner's laptop or chat.

Options considered:

1. **Migrate in every Vercel production build.** Simple, but any merge changes the schema, the build environment needs
   the direct (DDL) connection string, and failures happen mid-build.
2. **Run migrations from the owner's machine.** Production credentials would sit in a local file.
3. **A manually started GitHub Actions workflow** in a protected environment (chosen).

## Decision

- **Release workflow** (`.github/workflows/release-production.yml`): started by hand from the Actions tab, on `main`
  only, in the `production` GitHub environment, which requires the owner's approval and holds the secrets.
  - `status`: read-only preflight.
  - `release` (typed confirmation): preflight -> `prisma migrate deploy` -> verify nothing is pending -> check this
    run's commit is still the head of `main` -> trigger the Vercel production deploy hook.
- **Preflight** (`scripts/production-migrations.mts`) signs in with the direct connection inside a READ ONLY
  transaction and refuses unless: it runs in that workflow on `main`; `DATABASE_ENV=production`; the connection is
  direct (not pooled); the database's SHA-256 fingerprint (host + database name, no credentials) equals the
  `PRODUCTION_DATABASE_FINGERPRINT` environment variable; no migration has failed; and the database has no migration
  this commit doesn't know.
- **The guarded wrapper** (`scripts/db.ts production ...`) allows exactly `migrate deploy` and repeats the context and
  identity checks. `reset`, `db push`, `migrate dev`, `db seed` and `studio` are refused.
- **Vercel never migrates and never deploys `main` on its own**: `vercel.json` disables Git deployments for `main`;
  production deploys come only from the release workflow's deploy hook. Preview deployments still build, without
  production credentials (Vercel variables are scoped to Production only), and fail closed at runtime.
- **The app refuses mismatched configuration** (`src/server/deployment.ts`): the production deployment must use the
  production database over `https://`, and nothing else may use the production database.
- **CI hygiene**: `npm ci --ignore-scripts` (no dependency install scripts run where secrets exist), the database
  secret is exposed only to the three database steps, output is redacted, and `tests/deployment-config.test.ts` fails
  CI if any of these rules is removed.
- **Order of changes** (expand, then contract): a release migrates first and deploys second, so every migration must
  work with the app version that is already live (add nullable columns or new tables; backfill; remove old columns
  only in a later release once no deployed code uses them).
- **Testing state**: production shows a "Testing" banner and holds invented data only until gate B is signed off and
  `REAL_DATA_APPROVED=true` is set in Vercel.

## Consequences

- Releasing takes two clicks plus an approval, and the app can't be deployed to production by pushing alone.
- The deploy hook builds the latest `main`; the workflow checks `main` has not moved, leaving a window of seconds.
- Vercel's documentation does not state that deploy hooks still run when `git.deploymentEnabled` is off for `main`.
  The first release verifies it (docs/deployment.md). If hooks are blocked, the fallback is the Vercel CLI
  (`vercel deploy --prod` with a scoped token in the same environment), which also pins the exact commit.
- A Neon role with fewer privileges for the app (no DDL) would add defence in depth; deferred.
- Rolling back the app is Vercel's instant rollback; the schema only moves forward (fix with a new migration;
  backups and restore arrive in Task 9).
