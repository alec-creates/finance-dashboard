# Integration research

Researched 2026-10-25. "Unverified" means no official source confirmed it; verify before building. Policy (ADR-0003):
official, read-only, free integrations only; no credential scraping or browser automation; no paid integration
without asking first. Every account must work fully with CSV import or manual entry alone.

## Summary by account type

| Account type                         | Official consumer API                                                                                                                                                         | Free automatic option                                                                                                                  | File export                                                                                              | Plan                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Bank** (checking, savings)         | Rare for community banks and credit unions                                                                                                                                    | Plaid Trial (free, 10 Items) if Plaid lists the institution; check in Plaid Link                                                       | Usually CSV and/or QFX/OFX/QBO from online banking transaction history                                   | CSV first; Plaid Trial in Phase 6                                   |
| **Credit card**                      | Rare                                                                                                                                                                          | Plaid, e.g. **Barclaycard (US)** is listed with Balance + Transactions                                                                 | Varies by issuer                                                                                         | CSV first; Plaid Trial in Phase 6                                   |
| **Brokerage**, e.g. **Webull**       | Webull OpenAPI exists for individual accounts, but needs an application, ~$100 minimum account value and review, and is a **trading** API; a read-only scope is not confirmed | Plaid Investments covers holdings + 24 months of transactions in general; per-broker coverage and Trial-plan access are unverified     | Webull: order history CSV (emailed, reportedly once a day, no fees in file); monthly statements as Excel | CSV + manual holdings snapshots; prices from a free EOD source      |
| **Crypto exchange**, e.g. **Kraken** | **Yes**: official REST API, free, granular key permissions; public price endpoints need no key                                                                                | Kraken API with a key limited to Query Funds + Query Ledger Entries (+ Query Closed Orders & Trades). Never Trade, Deposit or Withdraw | Documents > Export: Ledgers and Trades (CSV or PDF); can take minutes to days                            | First automatic integration (Phase 6); ledger CSV import in Phase 4 |

## Details and caveats

### Banks

- Bank CSV exports usually have no running balance, so balances come from manual snapshots or the provider.
- Similar institution names are common (several banks share an acronym). When linking through Plaid, match the
  institution by its website, not its name.
- Export layouts differ per bank, so each needs a CSV import profile built from real header rows (never committed).

### Credit cards

- Plaid's institution page for Barclaycard (US) lists account type credit and products Assets/Balance/Transactions.

### Brokerages (Webull)

- The Webull OpenAPI's purpose is order execution and account management. A key that can trade conflicts with the
  read-only rule, so it is **not planned** unless Webull documents a read-only key.
- Fractional shares need `Decimal` quantities (see data model).
- Retirement accounts (Traditional/Roth IRA) at the same broker are separate accounts (ADR-0007).

### Crypto exchanges (Kraken)

- The API can report a key's own permissions; the app should refuse a key that has trading, deposit or withdrawal
  rights.
- Ledger entries cover deposits, withdrawals, trades, fees and staking; trades are grouped by `refid`.
- Crypto prices: Kraken's public ticker and OHLC endpoints (free, no key).

### Plaid

- New US teams created on or after 2026-04-15 get the free **Trial** plan: real production data, max **10 Items**
  (one Item = one institution login, which can cover several accounts at that institution).
- Plaid refreshes data from banks a few times a day; on-demand refresh may be a paid add-on. "Refresh" in this app
  means pulling whatever Plaid already has.
- Plaid webhooks need a public HTTPS endpoint (the Vercel deployment).
- SimpleFIN Bridge (~$15/year) was considered and **excluded** by the $0 constraint.

### Stock prices

Free end-of-day options exist, with limits that change often: Alpha Vantage (consistently reported at 25 requests/day),
Tiingo, Finnhub, Twelve Data. A handful of tickers priced once a day fits within those. Pick one in Phase 4 after
checking its current terms for personal use.

## Sources

- [Plaid - Barclaycard institution page](https://plaid.com/institutions/barclaycard/)
- [Plaid - Sandbox vs Trial vs Limited Production](https://support.plaid.com/hc/en-us/articles/16110110883479-How-are-Sandbox-Production-Trial-plan-and-Limited-Production-different)
- [Plaid - Can I use Plaid for free](https://support.plaid.com/hc/en-us/articles/16194695660311-Can-I-use-Plaid-for-free)
- [Plaid - Investments docs](https://plaid.com/docs/investments/)
- [Webull OpenAPI](https://www.webull.com/open-api)
- [Webull developer docs](https://developer.webull.com/apis/docs/)
- [Webull help - APIs](https://www.webull.com/help/faq/10512-Application-Programming-Interfaces-APIs)
- [Webull - Trading API application](https://developer.webull.com/apis/docs/authentication/IndividualApplicationAPI/)
- [Sharesight - Webull export guide (third party)](https://sharesight.com/partners/webull)
- [TradeZella - Webull integration notes (third party)](https://www.tradezella.com/integrations/webull)
- [Kraken - API keys guide](https://docs.kraken.com/exchange/guides/rest/api-keys)
- [Kraken - Get API key info](https://docs.kraken.com/api-reference/account-data/get-api-key-info.md)
- [Kraken - Query ledgers](https://docs.kraken.com/api-reference/account-data/query-ledgers.md)
- [Kraken - Export account history](https://support.kraken.com/articles/208267878-how-to-create-a-tax-report)
- [SimpleFIN Bridge](https://bridge.simplefin.org)
