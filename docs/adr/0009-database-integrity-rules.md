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
- **SQL constraints in migrations** for rules Prisma cannot express (first-of-month budgets, investment type iff
  investment account, fractions in 0..1, non-negative amounts, per-parent unique category names).
- **App-level invariants** with tests and an integrity-check query where a constraint would need triggers: split sums,
  allocation share sums, goal allocations within balance, budget hierarchy.

## Consequences

- Cross-user references are impossible even if a service has a bug.
- Every importer must translate signs; adapter tests must cover it.
- Composite relations make the Prisma schema more verbose; the trade is worth it for financial data.
