# Deploying to production

How the production deployment is set up and released (ADR-0011). Everything here is free: Vercel Hobby, Neon Free and
GitHub Actions on a public repository.

> **Never paste connection strings, tokens or other secrets into chat, issues, commits or screenshots.** They go only
> into the Neon, Vercel and GitHub dashboards named below.

## How a production deployment happens

There is exactly one path, the **Release production** workflow, started by hand and approved by the owner:

1. Preflight against the production database (read-only identity and migration checks).
2. `prisma migrate deploy` through the guarded wrapper, then a check that nothing is pending.
3. A clean `git worktree` of the run's commit (no dependencies, build output or untracked files).
4. `vercel deploy --prod` with the pinned Vercel CLI from that worktree. Vercel uploads exactly those files, builds them
   on its own build infrastructure with the project's Production variables, and the step waits until the deployment
   is ready (or fails). The deployment's metadata records `githubCommitSha`.

Vercel's own Git integration is switched off for every branch (`"git": { "deploymentEnabled": false }`, as Vercel's
GitHub Actions guide recommends), so pushes never build or deploy anything, previews included.

**How the deploy credentials are protected**

- `VERCEL_TOKEN` is a **project-scoped** token with an expiry, stored only as a secret of the GitHub `production`
  environment. Only the deploy step receives it, as an environment variable (the CLI reads `VERCEL_TOKEN`, so it is
  never a command-line argument), and GitHub masks it in logs. It can't reach other projects or create tokens.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are identifiers, not secrets; they are environment variables of the same
  GitHub environment.
- The workflow never runs `vercel pull` or `vercel build`, so production variables (database URL, auth secret) are
  never downloaded to the GitHub runner. They stay in Vercel.
- The CLI version is pinned (`vercel@64.0.2`, released 2026-10-13) and npm verifies the package's integrity. Update it
  deliberately, to a release at least two weeks old.
- The environment's required reviewer (you) approves every run, and runs are limited to `main`.

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

1. Sign up for Vercel (Hobby) with GitHub. **Add New -> Project**, import `alec-creates/finance-dashboard` and keep
   the detected Next.js settings. If Vercel insists on an initial deployment, let it run: it has no production
   variables yet, so it can't reach any database, and the next release replaces it.
2. **Settings -> Environment Variables.** Add each of these with **only "Production"** ticked (untick Preview and
   Development) and mark them **Sensitive**:
   - `DATABASE_URL`: the pooled string.
   - `DATABASE_ENV`: `production`
   - `BETTER_AUTH_SECRET`: a new random value. Generate one on your machine with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never reuse the development one.
   - `BETTER_AUTH_URL`: the production address shown under **Domains**, e.g. `https://<project>.vercel.app`.
   - `OWNER_EMAIL`: your email address.
   - Do **not** add `DIRECT_URL` (Vercel never migrates) or `REAL_DATA_APPROVED` (that comes after gate B).
3. **Settings -> Deployment Protection**: keep Vercel Authentication on for preview deployments (there are none while
   Git deployments are off, but it stays a safe default).
4. **Do not create a deploy hook.** Production deployments come only from the release workflow.
5. **Note the IDs** (not secret): the **Project ID** under the project's **Settings -> General**, and your
   team/account ID under the team's **Settings -> General** ("Team ID", starting `team_`). Alternatively run
   `npx vercel@64.0.2 link` locally and read `orgId` and `projectId` from `.vercel/project.json` (gitignored).
6. **Create the deploy token**: your account **Settings -> Tokens -> Create**. Name it `github-release-production`,
   choose the narrowest scope offered (**Project**: this project; otherwise the team), and an expiry (90 days is a good
   default; renew it before it lapses). Copy it straight into GitHub in the next step; Vercel shows it only once.

### 3. GitHub: the protected `production` environment

1. **Settings -> Environments -> New environment**, named `production`.
2. **Required reviewers**: add yourself. **Deployment branches and tags**: "Selected branches and tags", `main` only.
3. **Environment secrets**:
   - `PRODUCTION_DIRECT_URL`: the direct Neon string.
   - `VERCEL_TOKEN`: the deploy token.
4. **Environment variables**:
   - `PRODUCTION_DATABASE_FINGERPRINT`: the fingerprint from step 1.3.
   - `VERCEL_ORG_ID`: the team/account ID from step 2.5.
   - `VERCEL_PROJECT_ID`: the project ID from step 2.5.
5. Don't add any of these as repository secrets or variables: only the `production` environment holds them.
6. Recommended: **Settings -> Branches**, protect `main` and require the CI checks to pass.

## Releasing

Run every release from the latest `main`, after CI has passed:

1. **Actions -> Release production -> Run workflow**, branch `main`, action **status**. Approve the run. Read the
   output: the fingerprint matches, and it lists applied and pending migrations. It never changes anything.
2. Run it again with action **release** and type `release production` in the confirm field. Approve. It checks the
   run's commit is the latest `main` (before touching anything), applies pending migrations with
   `prisma migrate deploy`, checks nothing is pending, and deploys **that exact commit** with the Vercel CLI. The
   workflow succeeds only once the deployment is ready.
3. The workflow log prints the deployment address. In Vercel, the **Production** deployment's metadata shows the
   same `githubCommitSha`.

If the deploy step fails after migrations succeeded, nothing is lost: the database is ahead of the live app, which
the expand-first rule below allows. Fix the problem and run **release** again; the preflight will show nothing
pending and the deploy runs again.

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
