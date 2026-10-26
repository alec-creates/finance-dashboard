# 0002. Money and numeric precision

- Status: Accepted
- Date: 2026-10-25

## Context

Floating-point arithmetic cannot represent most decimal fractions exactly, so sums of currency drift. Investments add
values that are not whole cents: fractional shares, crypto quantities with up to 18 decimals, and prices with many
decimals.

## Decision

- **USD amounts** (transactions, balances, budgets, market values, goals) are stored as **integer cents** (`Int`) and
  manipulated only through `src/lib/money.ts`.
- **Quantities** are `Decimal(38,18)`, **unit prices** `Decimal(24,10)`, **FX rates** `Decimal(24,12)`,
  **percentages** `Decimal(7,6)`, handled with `Prisma.Decimal` (decimal.js).
- Conversion to cents happens once, in one helper, rounding **half-even**. Allocation of an amount across shares
  (e.g. a contribution split between two investment accounts) uses a largest-remainder method so parts sum exactly.

## Consequences

- No floats in financial paths; lint and review should flag `parseFloat`/`Number()` on amounts.
- A single `Int` value is capped at about $21.4M. Aggregations happen in SQL (`bigint`) or in TS with safe integers.
- Two numeric types in TS (number cents and Decimal) need clear naming: `*Cents` vs `quantity`/`price`.
