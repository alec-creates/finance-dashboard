import { describe, expect, it } from "vitest";

import {
  balanceAmountLabel,
  parseAccountForm,
  parseBalanceForm,
} from "./account-forms";

const NOW = new Date("2026-10-26T12:00:00Z"); // UTC+14 is already 2026-10-27

describe("parseAccountForm", () => {
  const checking = {
    name: "  Everyday checking  ",
    type: "CHECKING",
    institutionName: "Example Bank",
    mask: "0042",
    includeInNetWorth: "on",
    includeInSafeToSpend: "on",
    minimumBalance: "$500.00",
  };

  it("accepts a complete checking account and trims text", () => {
    expect(parseAccountForm(checking)).toEqual({
      ok: true,
      data: {
        name: "Everyday checking",
        type: "CHECKING",
        investmentType: null,
        institutionName: "Example Bank",
        mask: "0042",
        includeInNetWorth: true,
        includeInSafeToSpend: true,
        minimumBalanceCents: 50_000,
      },
    });
  });

  it("reads FormData the same way, with unchecked boxes as false", () => {
    const form = new FormData();
    form.set("name", "Card");
    form.set("type", "CREDIT_CARD");
    const result = parseAccountForm(form);
    expect(result).toMatchObject({
      ok: true,
      data: {
        includeInNetWorth: false,
        includeInSafeToSpend: false,
        institutionName: null,
        mask: null,
        minimumBalanceCents: null,
      },
    });
  });

  it("requires a name and a known type", () => {
    const result = parseAccountForm({ name: " ", type: "PIGGY_BANK" });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "Give the account a name",
        type: "Choose an account type",
      },
    });
  });

  it("limits names to 80 characters", () => {
    const result = parseAccountForm({ name: "x".repeat(81), type: "CASH" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.name).toMatch(/80/);
  });

  it("accepts only the last 2 to 4 digits, never a full account number", () => {
    for (const mask of ["1234567890", "12a4", "1"]) {
      const result = parseAccountForm({ ...checking, mask });
      expect(!result.ok && result.fieldErrors.mask).toBeTruthy();
    }
    expect(parseAccountForm({ ...checking, mask: "" })).toMatchObject({
      ok: true,
      data: { mask: null },
    });
  });

  it("requires the kind of investment account for investments only", () => {
    expect(parseAccountForm({ name: "Brokerage", type: "INVESTMENT" })).toEqual(
      {
        ok: false,
        fieldErrors: {
          investmentType: "Choose the kind of investment account",
        },
      },
    );
    expect(
      parseAccountForm({
        name: "Roth",
        type: "INVESTMENT",
        investmentType: "ROTH_IRA",
      }),
    ).toMatchObject({ ok: true, data: { investmentType: "ROTH_IRA" } });
    expect(
      parseAccountForm({
        name: "Card",
        type: "CREDIT_CARD",
        investmentType: "ROTH_IRA",
      }),
    ).toMatchObject({ ok: true, data: { investmentType: null } });
  });

  it("drops Safe to Spend settings for accounts that cannot be spent from", () => {
    expect(
      parseAccountForm({
        ...checking,
        type: "CREDIT_CARD",
        minimumBalance: "not even a number",
      }),
    ).toMatchObject({
      ok: true,
      data: { includeInSafeToSpend: false, minimumBalanceCents: null },
    });
  });

  it("rejects invalid or negative minimum balances", () => {
    expect(
      parseAccountForm({ ...checking, minimumBalance: "12.345" }),
    ).toMatchObject({ ok: false, fieldErrors: { minimumBalance: /amount/ } });
    expect(
      parseAccountForm({ ...checking, minimumBalance: "-1" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { minimumBalance: "The minimum balance cannot be negative" },
    });
  });
});

describe("parseBalanceForm", () => {
  it("stores a checking balance as entered, with an optional available balance", () => {
    expect(
      parseBalanceForm(
        "CHECKING",
        { asOfDate: "2026-10-26", amount: "1,234.56", available: "1,200" },
        NOW,
      ),
    ).toEqual({
      ok: true,
      data: {
        storage: "snapshot",
        asOfDate: "2026-10-26",
        balanceCents: 123_456,
        availableCents: 120_000,
      },
    });
  });

  it("stores the amount owed on a card as a negative balance and ignores 'available'", () => {
    expect(
      parseBalanceForm(
        "CREDIT_CARD",
        { asOfDate: "2026-10-26", amount: "420", available: "5000" },
        NOW,
      ),
    ).toEqual({
      ok: true,
      data: {
        storage: "snapshot",
        asOfDate: "2026-10-26",
        balanceCents: -42_000,
        availableCents: null,
      },
    });
  });

  it("stores an investment total as holdings plus cash", () => {
    expect(
      parseBalanceForm(
        "INVESTMENT",
        { asOfDate: "2026-10-01", amount: "10,250.50", cash: "250.50" },
        NOW,
      ),
    ).toEqual({
      ok: true,
      data: {
        storage: "valuation",
        asOfDate: "2026-10-01",
        marketValueCents: 1_000_000,
        cashCents: 25_050,
      },
    });
    expect(
      parseBalanceForm(
        "INVESTMENT",
        { asOfDate: "2026-10-01", amount: "100" },
        NOW,
      ),
    ).toMatchObject({
      ok: true,
      data: { cashCents: 0, marketValueCents: 10_000 },
    });
  });

  it("rejects cash larger than the total and negative investment values", () => {
    expect(
      parseBalanceForm(
        "INVESTMENT",
        { asOfDate: "2026-10-01", amount: "100", cash: "100.01" },
        NOW,
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { cash: "Cash must be between zero and the total value" },
    });
    expect(
      parseBalanceForm(
        "INVESTMENT",
        { asOfDate: "2026-10-01", amount: "-5" },
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { amount: "An account value cannot be negative" },
    });
  });

  it("requires a date and an amount", () => {
    expect(parseBalanceForm("SAVINGS", {}, NOW)).toEqual({
      ok: false,
      fieldErrors: { asOfDate: "Enter a date", amount: "Enter an amount" },
    });
  });

  it("rejects malformed amounts without echoing them", () => {
    const result = parseBalanceForm(
      "SAVINGS",
      { asOfDate: "2026-10-26", amount: "12,34" },
      NOW,
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { amount: "Enter an amount like 1,234.56" },
    });
  });

  it("rejects impossible, future and very old dates", () => {
    const at = (asOfDate: string) =>
      parseBalanceForm("CASH", { asOfDate, amount: "1" }, NOW);
    expect(at("2026-02-30")).toMatchObject({
      fieldErrors: { asOfDate: "Enter a date" },
    });
    expect(at("2026-10-28")).toMatchObject({
      fieldErrors: { asOfDate: "The date cannot be in the future" },
    });
    expect(at("1969-12-31")).toMatchObject({
      fieldErrors: { asOfDate: "Enter a date in 1970 or later" },
    });
    // Already "today" somewhere on Earth.
    expect(at("2026-10-27")).toMatchObject({ ok: true });
  });
});

describe("balanceAmountLabel", () => {
  it("names the amount by what it means for the account", () => {
    expect(balanceAmountLabel("CHECKING")).toBe("Balance");
    expect(balanceAmountLabel("CREDIT_CARD")).toBe("Amount owed");
    expect(balanceAmountLabel("INVESTMENT")).toBe("Total account value");
  });
});
