# 0006. Shared schedules and flexible contribution rules

- Status: Accepted
- Date: 2026-10-25

## Context

Pay arrives on its own schedule (weekly, biweekly, semimonthly or monthly), while investment contributions may run on a
different one (for example weekly contributions that later switch to biweekly). Contributions can be a fixed amount, a
percentage of income, or a percentage of each paycheck, split across several investment accounts. Recurring bills
need schedules too. None of this may be hardcoded to one person's habits.

## Decision

- One pure schedule model (`src/lib/schedules.ts`) for pay, contributions and bills: `weekly`, `biweekly`,
  `semimonthly`, `monthly`, `everyNDays`, `everyNMonths`, each with optional weekend adjustment. Occurrences are
  calendar dates, computed (not stored), and schedules extend both before and after their anchor date.
- Contribution plans have a rule type: `FIXED_AMOUNT` (per scheduled date), `PERCENT_OF_PAYCHECK` (on each paycheck)
  or `PERCENT_OF_INCOME` (of income received in the contribution period `(previous date, this date]`), an optional
  minimum, per-date overrides or skips, pause, and allocations whose shares must sum to exactly 1.
- Targets round half-even to cents once, then split with largest-remainder allocation.
- Planned targets are computed; actual contributions are transactions. They are compared, never mixed.

## Consequences

- Any combination of pay and contribution frequency works without special cases.
- `PERCENT_OF_INCOME` with a faster contribution schedule than pay produces uneven per-date targets (some $0); the UI
  should present totals per month as well.
- Bank holidays are not modelled; weekend adjustment covers the common case.
