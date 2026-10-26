# Deploying to production

How the production deployment is set up and released (ADR-0011). Everything here is free: Vercel Hobby, Neon Free and
GitHub Actions on a public repository.

> **Never paste connection strings, secrets or deploy hook URLs into chat, issues, commits or screenshots.** They go
> only into the Neon, Vercel and GitHub dashboards named below.

Production starts in a **testing state**: a "Testing - do not enter real financial data" banner on every page, and
invented data only. Real data waits for gate B in `TASKS.md`.

## One-time setup

### 1. Neon: the production database

1. In the Neon Console, create a project named `finance-dashboard-prod`. Use the same Postgres version as
   development. Pick the region closest to where Vercel runs the app (Vercel's default is Washington, D.C., so AWS
   US East, N. Virginia). On the free plan, check that a third project is allowed.
2. Open **Connect** for that project and keep the dialog open. You need two strings from it:
   - **Pooled** (Connection pooling **on**, host contains `-pooler`): for Vercel's `DATABASE_URL`.
   - **Direct** (Connection pooling **off**): for GitHub's `PRODUCTION_DIRECT_URL`.
3. In this repository, run `npm run db:fingerprint` and paste the **direct** string when asked. It is not shown or
   stored. Note the printed fingerprint (64 hexadecimal characters); it is not secret.

### 2. Vercel: the app

1. Sign up for Vercel (Hobby) with GitHub. **Add New -> Project**, import `alec-creates/finance-dashboard`, keep the
   detected Next.js settings, and don't deploy yet if it lets you skip; otherwise let the first build run (it has no
   database yet and that is fine).
2. **Settings -> Environment Variables.** Add each of these with **only "Production"** ticked (untick Preview and
   Development) and mark them **Sensitive**:
   - `DATABASE_URL`: the pooled string.
   - `DATABASE_ENV`: `production`
   - `BETTER_AUTH_SECRET`: a new random value. Generate one on your machine with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never reuse the development one.
   - `BETTER_AUTH_URL`: the production address shown under **Domains**, e.g. `https://<project>.vercel.app`.
   - `OWNER_EMAIL`: your email address.
   - Do **not** add `DIRECT_URL` (Vercel never migrates) or `REAL_DATA_APPROVED` (that comes after gate B).
3. **Settings -> Deployment Protection**: keep Vercel Authentication on for preview deployments.
4. **Settings -> Git -> Deploy Hooks**: create a hook named `release-production` for the `main` branch. Copy its URL
   straight into GitHub in the next step; anyone with it can trigger a deployment.

### 3. GitHub: the protected `production` environment

1. **Settings -> Environments -> New environment**, named `production`.
2. **Required reviewers**: add yourself. **Deployment branches and tags**: "Selected branches and tags", `main` only.
3. **Environment secrets**:
   - `PRODUCTION_DIRECT_URL`: the direct Neon string.
   - `VERCEL_PRODUCTION_DEPLOY_HOOK`: the deploy hook URL.
4. **Environment variables**: `PRODUCTION_DATABASE_FINGERPRINT` = the fingerprint from step 1.3.
5. Recommended: **Settings -> Branches**, protect `main` and require the CI checks to pass.

## Releasing

Run every release from the latest `main`, after CI has passed:

1. **Actions -> Release production -> Run workflow**, branch `main`, action **status**. Approve the run. Read the
   output: the fingerprint matches, and it lists applied and pending migrations. It never changes anything.
2. Run it again with action **release** and type `release production` in the confirm field. Approve. It applies the
   pending migrations with `prisma migrate deploy`, checks nothing is pending, checks `main` hasn't moved, and then
   triggers the production deployment on Vercel.
3. In Vercel, watch the new **Production** deployment of that commit finish.

**First release only:** confirm in Vercel that the deploy hook produced a Production deployment of the latest `main`
commit while Git deployments for `main` are disabled. Vercel's documentation doesn't state this explicitly. If no
deployment appears, stop and tell Claude; the fallback is deploying with the Vercel CLI from the same workflow.

### Order of changes

Migrations run before the new app version goes live, so the app that is still running must keep working with the
new schema:

- **Expand first**: add tables, nullable columns or columns with defaults; backfill in the same or a later release.
- **Contract later**: drop or rename columns only in a later release, after no deployed code uses them.
- Never edit a migration that has been released; add a new one.

### If something goes wrong

- **App problem**: in Vercel, use **Instant Rollback** to the previous production deployment. The schema stays.
- **Migration failed**: the release stops before deploying. Prisma records the failed migration and refuses further
  deploys until it is resolved; fix it with a new migration (and, for a partial failure, `prisma migrate resolve`,
  which needs a deliberate code change to the guarded wrapper, reviewed first).
- **Data**: backups and a tested restore procedure arrive in Task 9; until then production holds invented data only.

## After the first release (still testing state)

1. Open the production address. The yellow "Testing" banner must be visible on every page.
2. Go to `/setup`, create the owner account with `OWNER_EMAIL` and a new password from your password manager, and set
   up two-factor authentication. Store the backup codes.
3. Checks (Task 8 acceptance):
   - Browser developer tools -> Application -> Cookies: the session cookie is named `__Secure-finance.session_token`
     and is `Secure` and `HttpOnly`.
   - Claude can check the signed-out behaviour from its browser: redirects, `401` from `/api/accounts`, a refused
     foreign-origin POST, security headers, the manifest and icons.
   - Neon Console -> SQL Editor: `select split_part(key, '|', 1) as ip from "RateLimit" limit 5;` shows your public IP
     address, not a shared placeholder. (Only you see this; don't share it.)
4. Enter invented data only. Gate B in `TASKS.md` decides when real data is allowed.
