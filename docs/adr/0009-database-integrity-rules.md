# 0009. Database integrity rules: ownership, signs, deletes and constraints

- Status: Accepted
- Date: 2026-10-26

## Context

A review of the data model before writing the Prisma schema found gaps that application code alone would have to
guard: rows that could reference another user's data, no defined sign for credit card and loan balances, a stored
`isLiability` flag that could drift from the account type, an id array without referential integrity, undefined
delete behaviour, and rules (first-of-month budgets, fraction ranges) that only the app enforced.

## Decision

- **Ownership in the database:** every user-owned table has `userId`; parents expose `@@unique([id, userId])` and
  children reference them through composite relations that include `userId`.
- **One sign convention (owner's net-worth view):** positive means more money for the owner, negative less, for
  transactions and balances alike. Card and loan balances owed are negative; net worth is a plain sum. Adapters
  convert provider conventions on import.
- **No stored derived flags:** liability status comes from the account type. Safe to Spend accounts are chosen with a
  boolean on the account instead of an id array.
- **Explicit `onDelete` behaviour:** cascade from the user; undo-import deletes that batch's transactions; accounts,
  categories, merchants and assets with history are archived, not deleted; plans, series and goals are soft deleted.
  "Restricted" relations are `NO ACTION` (end-of-statement check) so a cascading user delete works; composite relations
  never `SET NULL` (it would null `userId`); every foreign key is `ON UPDATE NO ACTION` so ownership cannot move.
- **SQL constraints in migrations** for rules Prisma cannot express (first-of-month budgets, investment type iff
  investment account, fractions in 0..1, non-negative amounts, USD-only accounts, investment cash directions,
  goal-ledger signs, case-insensitive per-parent unique category names). Prisma leaves them in place: a drift check
  after the first migration produced an empty migration.
- **Deferred constraint triggers** (checked at commit) for the two invariants that span rows: splits sum exactly to
  their transaction (and every transaction has a split), and contribution allocation shares sum to exactly 1.
- **App-level invariants** with tests where the database cannot reasonably check: goal allocations within balance,
  budget hierarchy, transfer legs netting to zero, sign-versus-kind consistency.

## Consequences

- Cross-user references are impossible even if a service has a bug.
- Every importer must translate signs; adapter tests must cover it.
- Composite relations make the Prisma schema more verbose; the trade is worth it for financial data.
- Writes that create a transaction must create its splits in the same database transaction (nested create or
  `$transaction`); otherwise the commit is rejected.
- Nested Prisma creates fill `userId` from the parent; services must not pass it for nested children.
