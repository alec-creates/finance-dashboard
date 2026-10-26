# 0007. Investment account types, including retirement accounts

- Status: Accepted
- Date: 2026-10-25

## Context

Typical holdings are individual stocks or ETFs in a taxable brokerage account and crypto at an exchange, and a Roth IRA
may be opened at the same broker. Investments should be viewable by account type, asset class and holding. Options trading is not in scope.

## Decision

- Investment accounts are `FinancialAccount`s with `type = INVESTMENT` and an `investmentType`:
  `TAXABLE_BROKERAGE`, `TRADITIONAL_IRA`, `ROTH_IRA`, `CRYPTO_EXCHANGE`, `OTHER_INVESTMENT`.
- A retirement account is always its own account, even at the same institution as a taxable one.
- IRA deposits record a `contributionTaxYear`; contributions into any investment account are contributions, never
  expenses.
- Asset classes start with equities, ETFs, mutual funds, crypto and cash. `OPTION` is reserved in the enum only.

## Consequences

- Breakdowns by account type, asset class and holding come from the same tables.
- Contribution limits and tax rules are not modelled; the app is for tracking and planning, not tax advice.
