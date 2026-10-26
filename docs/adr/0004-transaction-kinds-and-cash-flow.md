# 0004. Transaction kinds and cash-flow classification

- Status: Accepted
- Date: 2026-10-25

## Context

Budgets, income, net worth and forecasts must not double count credit card payments, transfers between own accounts,
or investment contributions, and refunds must reduce spending rather than look like income.

## Decision

- Every cash transaction has a `kind` separate from its category: `INCOME`, `EXPENSE`, `REFUND`, `TRANSFER`,
  `CREDIT_CARD_PAYMENT`, `INVESTMENT_CONTRIBUTION`, `INVESTMENT_WITHDRAWAL`, `ADJUSTMENT`.
- Reports select by kind. Living expenses = `EXPENSE` + `REFUND` splits; contributions are their own bucket; transfers,
  card payments and adjustments are ignored by cash flow.
- Both legs of an internal movement (checking -> card, checking -> brokerage) are linked (`transferPairId` /
  `linkedCashTransactionId`) and suggested automatically when amounts match within a few days.
- Buying or selling inside an investment account is an `InvestmentTransaction` and never touches spending; market
  gains come only from valuations.
- Categories are attached to splits; each transaction has at least one split summing exactly to its amount.

## Consequences

- Credit card purchases count as spending on the purchase date; the bill payment does not.
- Net worth is unchanged by internal movements by construction.
- Classification errors are visible and fixable in the review queue instead of silently skewing totals.
