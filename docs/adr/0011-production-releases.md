# 0011. Production releases: manual, approved migrations, then a pinned-commit deploy

- Status: Accepted
- Date: 2026-10-26 (deploy mechanism revised 2026-10-27, before the first release)

## Context

Production holds the owner's real financial data (once gate B is signed off). A schema change must never happen as a
side effect of building the app, must never run anything but `prisma migrate deploy`, and must land before the code
that depends on it. The deployed app must be exactly the reviewed commit. Credentials must not reach preview
deployments, CI logs, the owner's laptop or chat.

Options considered for migrations:

1. **Migrate in every Vercel production build.** Any merge changes the schema, the build needs the direct (DDL)
   connection string, and failures happen mid-build.
2. **Run migrations from the owner's machine.** Production credentials would sit in a local file.
3. **A manually started GitHub Actions workflow** in a protected environment (chosen).

Options considered for deploying the app after migrating:

1. **Vercel's Git integration** deploying `main` on push: can deploy code before its migration.
2. **A deploy hook** triggered by the workflow: Vercel documents that hooks don't fire with `github.enabled = false`
   but not how they interact with `git.deploymentEnabled`, and doesn't state which commit a hook builds. Rejected:
   it relies on undocumented behaviour and can't pin the reviewed commit.
3. **`vercel pull` + `vercel build` + `vercel deploy --prebuilt`** (Vercel's GitHub Actions guide): pins the commit,
   but `vercel pull --environment=production` brings the Production variables (database URL, auth secret) onto the
   CI runner. Rejected.
4. **`vercel deploy --prod` from a clean checkout of the commit** (chosen): the documented CLI deploy uploads that
   commit's files and Vercel builds them on its own infrastructure with the project's Production variables, which
   never leave Vercel.

## Decision

- **Release workflow** (`.github/workflows/release-production.yml`): started by hand from the Actions tab, on `main`
  only, in the `production` GitHub environment, which requires the owner's approval and holds the secrets.
  - `status`: read-only preflight.
  - `release` (typed confirmation): check the run's commit is the head of `main` -> preflight ->
    `prisma migrate deploy` -> verify nothing is pending -> `git worktree` of exactly that commit ->
    `vercel deploy --prod` (pinned CLI, waits for the deployment, records `githubCommitSha` in its metadata).
- **Preflight** (`scripts/production-migrations.mts`) signs in with the direct connection inside a READ ONLY
  transaction and refuses unless: it runs in that workflow on `main`; `DATABASE_ENV=production`; the connection is
  direct (not pooled); the database's SHA-256 fingerprint (host + database name, no credentials) equals the
  `PRODUCTION_DATABASE_FINGERPRINT` environment variable; no migration has failed; and the database has no migration
  this commit doesn't know.
- **The guarded wrapper** (`scripts/db.ts production ...`) allows exactly `migrate deploy` and repeats the context and
  identity checks. `reset`, `db push`, `migrate dev`, `db seed` and `studio` are refused.
- **Vercel never deploys on its own**: `vercel.json` sets `git.deploymentEnabled` to `false` for every branch, as
  Vercel's GitHub Actions guide recommends. There are no preview deployments; Vercel's variables are scoped to
  Production only.
- **Deploy credentials**: a project-scoped, expiring `VERCEL_TOKEN` in the `production` environment, given only to the
  deploy step as an environment variable (never a command-line argument). `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are
  environment variables. The CLI version is pinned. The workflow never runs `vercel pull` or `vercel build`.
- **The app refuses mismatched configuration** (`src/server/deployment.ts`): the production deployment must use the
  production database over `https://`, and nothing else may use the production database.
- **CI hygiene**: `npm ci --ignore-scripts`, each secret exposed only to the steps that need it, redacted output, and
  `tests/deployment-config.test.ts` fails CI if any of these rules is removed.
- **Order of changes** (expand, then contract): migrations run before the new code goes live, so every migration
  must work with the app version that is already live.
- **Testing state**: production shows a "Testing" banner and holds invented data only until gate B is signed off and
  `REAL_DATA_APPROVED=true` is set in Vercel.

## Consequences

- Releasing takes two clicks plus an approval; pushing never deploys.
- The live app is exactly the reviewed commit, traceable through the deployment's `githubCommitSha` metadata. CLI
  deployments don't carry Vercel's Git metadata (no automatic PR comments or branch URLs), which this app doesn't use.
- If the deploy fails after migrating, the database is ahead of the live app (allowed by expand-first); re-running the
  release deploys again.
- The token must be renewed before it expires; an expired token fails the deploy step, never the migration checks.
- A Neon role with fewer privileges for the app (no DDL) would add defence in depth; deferred.
- Rolling back the app is Vercel's instant rollback; the schema only moves forward (fix with a new migration;
  backups and restore arrive in Task 9).
