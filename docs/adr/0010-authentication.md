# 0010. Authentication: Better Auth, owner-only, password + TOTP

- Status: Accepted
- Date: 2026-10-26

## Context

The app holds one person's financial data and is reachable from any device. It needs secure sign-in without public
registration, a second factor, sessions that can be revoked everywhere, brute-force protection, and server-side
checks on every page and API route. Custom auth code is a liability; officially supported features are preferred.

## Decision

- **Better Auth 1.7** (pinned) with its Prisma adapter, using only built-in features:
  - Email and password (scrypt hashing, 12-128 characters), plus the official Have I Been Pwned plugin (k-anonymity:
    only a hash prefix leaves the server) to reject breached passwords.
  - The **two-factor plugin (TOTP)** with 10 single-use backup codes, encrypted at rest with `BETTER_AUTH_SECRET`,
    and its built-in account lockout (10 failed codes locks verification for 15 minutes).
  - **Database sessions**, 7 days sliding (refreshed at most daily), no cookie cache, so sign-out and "sign out of
    other devices" take effect immediately everywhere. Cookies are httpOnly, SameSite=Lax, prefixed `finance.`, and
    Secure when served over HTTPS.
  - **Database-backed rate limiting** (works across serverless instances): 5 requests/minute per IP for sign-in and
    two-factor endpoints, 5/hour for sign-up, 100/minute elsewhere. `lastRequest` is stored as a double, not a BigInt,
    because Better Auth does arithmetic on it as a number.
- **Owner only.** `OWNER_EMAIL` (private, in env) is the only address that can create the account or hold a session:
  - a before-hook rejects `/sign-up/*` unless the email is the owner's and no sign-in method exists yet;
  - a `user.create` database hook repeats the check for any other code path;
  - a `session.create` database hook refuses sessions for any other email, even if `OWNER_EMAIL` changes later.
    Errors are generic: they never reveal whether an email is the owner's or an account exists.
- **2FA is mandatory.** Until it is set up, pages redirect to `/security/two-factor` and financial APIs return 403.
- **Layered route protection.** `src/proxy.ts` (Next.js 16 proxy) does an optimistic cookie check (redirect pages,
  401 for `/api/*`). The real check runs on the server against the database: `requireUser()` in every page and
  `requireApiUser()` in every route handler. Financial queries take `userId` only from the session.
- **Secrets** (`BETTER_AUTH_SECRET`, `OWNER_EMAIL`) live in gitignored env files locally and in Vercel settings in
  production; `npm run auth:setup-env` generates a separate random secret per environment without printing it.
- **No email service, no social login, no public sign-up page beyond the one-time `/setup`.**

## Consequences

- Losing both the authenticator and the backup codes locks the owner out; recovery is a documented manual database
  step (delete the `TwoFactor` row and reset `twoFactorEnabled`) until an email-based recovery exists.
- Changing `BETTER_AUTH_SECRET` signs everyone out and makes stored 2FA secrets unreadable (2FA must be set up again).
- Rate limits are per IP; production must forward the client IP (`x-forwarded-for`, as Vercel does).
- Adding more users later means replacing the owner-only hooks with an invitation flow; the schema already supports it.
