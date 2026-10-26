# 0003. Read-only, free-first financial integrations

- Status: Accepted
- Date: 2026-10-25

## Context

The owner has a bank account, a credit card, a brokerage account and a crypto exchange account. Automatic
sync is desirable but must cost $0, use only official and supported access, and never be able to move money.
Research is in `docs/integrations.md`.

## Decision

- **CSV import and manual entry are first-class** for every account; the app is fully correct without any automatic sync.
- All providers sit behind one adapter interface (`connect`, `sync(cursor)`, `getBalances`, `getHoldings`, `getStatus`),
  so adding one changes no domain code or schema.
- Order of automatic integrations (Phase 6): **Kraken API** (official, free) first; then **Plaid Trial** (free, 10 Items)
  for bank and credit card accounts after confirming each institution in Plaid Link; Webull only if a read-only
  official path is confirmed.
- Credentials: least privilege (Kraken: Query Funds, Query Ledger Entries, Query Closed Orders & Trades only),
  encrypted at rest, server-only, never logged. Keys with trade/deposit/withdraw rights are rejected.
- Excluded: screen scraping, automated browser logins, unofficial APIs, and paid services (e.g. SimpleFIN Bridge)
  unless the user approves.

## Consequences

- Brokerage data (e.g. Webull) will likely remain CSV + manual holdings snapshots.
- Plaid's free Trial terms may change; if so the app falls back to CSV without data loss.
- Daily-or-slower freshness is expected and the UI always shows "last updated".
