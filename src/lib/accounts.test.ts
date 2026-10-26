import { describe, expect, it } from "vitest";

import {
  ACCOUNT_GROUPS,
  ACCOUNT_TYPES,
  accountGroupOf,
  accountTypeLabel,
  balanceStorage,
  canChangeAccountType,
  describeBalance,
  entryFromStoredBalance,
  isLiabilityType,
  latestAllowedBalanceDate,
  latestEntry,
  splitValuation,
  storedBalanceFromEntry,
  supportsSafeToSpend,
  totalOfBalances,
  valuationTotalCents,
  type SnapshotSource,
} from "./accounts";
import type { CalendarDate } from "./dates";

const date = (value: string) => value as CalendarDate;

describe("account types", () => {
  it("knows which types are liabilities", () => {
    expect(ACCOUNT_TYPES.filter(isLiabilityType)).toEqual([
      "CREDIT_CARD",
      "LOAN",
      "OTHER_LIABILITY",
    ]);
  });

  it("allows Safe to Spend only for checking, savings and cash (as the database does)", () => {
    expect(ACCOUNT_TYPES.filter(supportsSafeToSpend)).toEqual([
      "CHECKING",
      "SAVINGS",
      "CASH",
    ]);
  });

  it("keeps investment value in valuations and everything else in snapshots", () => {
    expect(balanceStorage("INVESTMENT")).toBe("valuation");
    for (const type of ACCOUNT_TYPES.filter((t) => t !== "INVESTMENT")) {
      expect(balanceStorage(type)).toBe("snapshot");
    }
  });

  it("puts every type in exactly one group", () => {
    const grouped = ACCOUNT_GROUPS.flatMap(({ types }) => [...types]);
    expect([...grouped].sort()).toEqual([...ACCOUNT_TYPES].sort());
    expect(accountGroupOf("SAVINGS")).toBe("cash");
    expect(accountGroupOf("CREDIT_CARD")).toBe("credit");
    expect(accountGroupOf("LOAN")).toBe("loans");
    expect(() => accountGroupOf("BOGUS" as never)).toThrow(RangeError);
  });

  it("labels investment accounts by their kind", () => {
    expect(accountTypeLabel("INVESTMENT", "ROTH_IRA")).toBe("Roth IRA");
    expect(accountTypeLabel("INVESTMENT", null)).toBe("Investment");
    expect(accountTypeLabel("CREDIT_CARD")).toBe("Credit card");
  });
});

describe("sign convention", () => {
  it("stores an amount owed on a liability as negative", () => {
    expect(storedBalanceFromEntry("CREDIT_CARD", 42_000)).toBe(-42_000);
    expect(storedBalanceFromEntry("LOAN", 1_250_000)).toBe(-1_250_000);
  });

  it("stores a card's credit balance (entered as negative owed) as positive", () => {
    expect(storedBalanceFromEntry("CREDIT_CARD", -1_500)).toBe(1_500);
  });

  it("stores asset balances as entered, including an overdraft", () => {
    expect(storedBalanceFromEntry("CHECKING", 123_456)).toBe(123_456);
    expect(storedBalanceFromEntry("CHECKING", -2_500)).toBe(-2_500);
  });

  it("round-trips between the form and storage", () => {
    for (const type of ACCOUNT_TYPES) {
      for (const cents of [0, 1, -1, 99_999]) {
        expect(
          entryFromStoredBalance(type, storedBalanceFromEntry(type, cents)),
        ).toBe(cents);
      }
    }
  });

  it("never stores negative zero", () => {
    expect(Object.is(storedBalanceFromEntry("CREDIT_CARD", 0), 0)).toBe(true);
  });

  it("describes liabilities as owed, in credit or settled", () => {
    expect(describeBalance("CREDIT_CARD", -42_000)).toEqual({
      kind: "owed",
      amountCents: 42_000,
    });
    expect(describeBalance("CREDIT_CARD", 1_500)).toEqual({
      kind: "credit",
      amountCents: 1_500,
    });
    expect(describeBalance("LOAN", 0)).toEqual({ kind: "settled" });
    expect(describeBalance("CHECKING", -2_500)).toEqual({
      kind: "asset",
      amountCents: -2_500,
    });
  });
});

describe("latestEntry", () => {
  const entry = (asOfDate: string, source: SnapshotSource, id: string) => ({
    asOfDate: date(asOfDate),
    source,
    id,
  });

  it("returns nothing for no entries", () => {
    expect(latestEntry([])).toBeUndefined();
  });

  it("picks the latest date regardless of order", () => {
    const entries = [
      entry("2026-09-30", "MANUAL", "a"),
      entry("2026-10-15", "MANUAL", "b"),
      entry("2026-10-01", "STATEMENT", "c"),
    ];
    expect(latestEntry(entries)?.id).toBe("b");
  });

  it("on the same date prefers statement, then synced, then manual, then calculated", () => {
    const sameDay = [
      entry("2026-10-15", "COMPUTED", "computed"),
      entry("2026-10-15", "MANUAL", "manual"),
      entry("2026-10-15", "PROVIDER", "provider"),
    ];
    expect(latestEntry(sameDay)?.id).toBe("provider");
    expect(
      latestEntry([...sameDay, entry("2026-10-15", "STATEMENT", "statement")])
        ?.id,
    ).toBe("statement");
    expect(latestEntry(sameDay.slice(0, 2))?.id).toBe("manual");
  });

  it("does not let an older, more authoritative entry beat a newer one", () => {
    expect(
      latestEntry([
        entry("2026-10-01", "STATEMENT", "old"),
        entry("2026-10-02", "COMPUTED", "new"),
      ])?.id,
    ).toBe("new");
  });
});

describe("investment valuations", () => {
  it("totals holdings and cash", () => {
    expect(
      valuationTotalCents({ marketValueCents: 1_000_000, cashCents: 25_050 }),
    ).toBe(1_025_050);
  });

  it("splits an entered total so cash is part of it, not added to it", () => {
    const parts = splitValuation(1_025_050, 25_050);
    expect(parts).toEqual({ marketValueCents: 1_000_000, cashCents: 25_050 });
    expect(valuationTotalCents(parts)).toBe(1_025_050);
  });

  it("allows an all-cash or empty account", () => {
    expect(splitValuation(5_000, 5_000)).toEqual({
      marketValueCents: 0,
      cashCents: 5_000,
    });
    expect(splitValuation(0, 0)).toEqual({ marketValueCents: 0, cashCents: 0 });
  });

  it("rejects cash outside zero..total and negative totals", () => {
    expect(() => splitValuation(1_000, 1_001)).toThrow(RangeError);
    expect(() => splitValuation(1_000, -1)).toThrow(RangeError);
    expect(() => splitValuation(-1, 0)).toThrow(RangeError);
  });
});

describe("totalOfBalances", () => {
  it("sums known balances and counts missing ones instead of treating them as zero", () => {
    expect(totalOfBalances([10_000, null, -2_500, null])).toEqual({
      totalCents: 7_500,
      missing: 2,
    });
    expect(totalOfBalances([])).toEqual({ totalCents: 0, missing: 0 });
  });
});

describe("canChangeAccountType", () => {
  const checking = { type: "CHECKING", investmentType: null } as const;
  const savings = { type: "SAVINGS", investmentType: null } as const;
  const card = { type: "CREDIT_CARD", investmentType: null } as const;
  const roth = { type: "INVESTMENT", investmentType: "ROTH_IRA" } as const;
  const taxable = {
    type: "INVESTMENT",
    investmentType: "TAXABLE_BROKERAGE",
  } as const;

  it("allows any change while the account has no history", () => {
    expect(canChangeAccountType(checking, card, false)).toBe(true);
    expect(canChangeAccountType(roth, taxable, false)).toBe(true);
  });

  it("allows no-op edits with history", () => {
    expect(canChangeAccountType(card, card, true)).toBe(true);
    expect(canChangeAccountType(roth, roth, true)).toBe(true);
  });

  it("allows checking, savings and cash to switch with history", () => {
    expect(canChangeAccountType(checking, savings, true)).toBe(true);
  });

  it("refuses changes that would reinterpret recorded history", () => {
    expect(canChangeAccountType(checking, card, true)).toBe(false);
    expect(canChangeAccountType(card, checking, true)).toBe(false);
    expect(canChangeAccountType(checking, taxable, true)).toBe(false);
    expect(canChangeAccountType(roth, taxable, true)).toBe(false);
  });
});

describe("latestAllowedBalanceDate", () => {
  it("is today in UTC+14, a day ahead of UTC late in the UTC day", () => {
    expect(latestAllowedBalanceDate(new Date("2026-10-26T09:59:00Z"))).toBe(
      "2026-10-26",
    );
    expect(latestAllowedBalanceDate(new Date("2026-10-26T10:00:00Z"))).toBe(
      "2026-10-27",
    );
  });
});
