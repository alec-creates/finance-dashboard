import { describe, expect, it } from "vitest";

import { parseCategoryForm, parseTransactionForm } from "./transaction-forms";

const NOW = new Date("2026-10-26T12:00:00Z");

function form(
  fields: Record<string, string | string[]>,
  splits: [string, string][] = [],
): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  for (const [category, amount] of splits) {
    data.append("splitCategory", category);
    data.append("splitAmount", amount);
  }
  return data;
}

const expense = {
  accountId: "acct-card",
  date: "2026-10-20",
  description: "  Grocery run ",
  kind: "EXPENSE",
  amount: "84.37",
};

describe("parseTransactionForm", () => {
  it("stores an expense as negative with one split for the whole amount", () => {
    expect(
      parseTransactionForm(form(expense, [["cat-groceries", ""]]), NOW),
    ).toEqual({
      ok: true,
      data: {
        accountId: "acct-card",
        date: "2026-10-20",
        description: "Grocery run",
        kind: "EXPENSE",
        amountCents: -8_437,
        notes: null,
        splits: [{ categoryId: "cat-groceries", amountCents: -8_437 }],
      },
    });
  });

  it("allows an uncategorized expense", () => {
    expect(parseTransactionForm(form(expense), NOW)).toMatchObject({
      ok: true,
      data: { splits: [{ categoryId: null, amountCents: -8_437 }] },
    });
  });

  it("splits across categories, keeping every cent", () => {
    const result = parseTransactionForm(
      form({ ...expense, amount: "100.00" }, [
        ["cat-groceries", "33.34"],
        ["cat-household", "33.33"],
        ["cat-pharmacy", "33.33"],
      ]),
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        amountCents: -10_000,
        splits: [
          { categoryId: "cat-groceries", amountCents: -3_334 },
          { categoryId: "cat-household", amountCents: -3_333 },
          { categoryId: "cat-pharmacy", amountCents: -3_333 },
        ],
      },
    });
  });

  it("rejects splits that do not add up, by a single cent", () => {
    expect(
      parseTransactionForm(
        form({ ...expense, amount: "100.00" }, [
          ["a", "50.00"],
          ["b", "49.99"],
        ]),
        NOW,
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { splits: "The splits add up to less than the amount" },
    });
  });

  it("flags the exact split row with a bad amount", () => {
    expect(
      parseTransactionForm(
        form({ ...expense, amount: "100" }, [
          ["a", "100"],
          ["b", ""],
        ]),
        NOW,
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { "splitAmount.1": "Enter an amount" },
    });
  });

  it("makes refunds positive and keeps spending categories on them", () => {
    expect(
      parseTransactionForm(
        form({ ...expense, kind: "REFUND", amount: "20" }, [
          ["cat-groceries", ""],
        ]),
        NOW,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        amountCents: 2_000,
        splits: [{ categoryId: "cat-groceries", amountCents: 2_000 }],
      },
    });
  });

  it("needs a direction for a card payment and never categorizes it", () => {
    const payment = { ...expense, kind: "CREDIT_CARD_PAYMENT", amount: "420" };
    expect(parseTransactionForm(form(payment), NOW)).toEqual({
      ok: false,
      fieldErrors: { direction: "Choose whether money went in or out" },
    });
    expect(
      parseTransactionForm(form({ ...payment, direction: "out" }), NOW),
    ).toMatchObject({
      ok: true,
      data: {
        amountCents: -42_000,
        splits: [{ categoryId: null, amountCents: -42_000 }],
      },
    });
    expect(
      parseTransactionForm(
        form({ ...payment, direction: "in" }, [["cat-groceries", ""]]),
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { splits: /don't use categories/ },
    });
  });

  it("asks for a positive amount instead of accepting a sign", () => {
    expect(
      parseTransactionForm(form({ ...expense, amount: "-84.37" }), NOW),
    ).toMatchObject({
      ok: false,
      fieldErrors: { amount: /above zero/ },
    });
    expect(
      parseTransactionForm(form({ ...expense, amount: "0" }), NOW),
    ).toMatchObject({
      ok: false,
      fieldErrors: { amount: /above zero/ },
    });
  });

  it("validates required fields, dates and lengths", () => {
    const result = parseTransactionForm(
      form({
        accountId: "",
        date: "2026-10-28",
        description: "",
        kind: "GIFT",
        amount: "",
      }),
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        accountId: "Choose an account",
        date: "The date cannot be in the future",
        description: "Describe the transaction",
        kind: "Choose what kind of transaction this is",
        amount: "Enter an amount",
      },
    });
    expect(
      parseTransactionForm(form({ ...expense, notes: "x".repeat(1001) }), NOW),
    ).toMatchObject({ ok: false, fieldErrors: { notes: /1000/ } });
  });

  it("limits the number of splits", () => {
    const splits = Array.from(
      { length: 21 },
      (_, index) => [`c${index}`, "1"] as [string, string],
    );
    expect(
      parseTransactionForm(form({ ...expense, amount: "21" }, splits), NOW),
    ).toMatchObject({ ok: false, fieldErrors: { splits: /at most 20/ } });
  });
});

describe("parseCategoryForm", () => {
  it("accepts a subcategory and reads the essential box", () => {
    expect(
      parseCategoryForm(
        form({
          name: " Groceries ",
          type: "EXPENSE",
          parentId: "cat-food",
          isEssential: "on",
        }),
      ),
    ).toEqual({
      ok: true,
      data: {
        name: "Groceries",
        type: "EXPENSE",
        parentId: "cat-food",
        isEssential: true,
      },
    });
  });

  it("requires a name and a type", () => {
    expect(parseCategoryForm(form({ name: "", type: "" }))).toEqual({
      ok: false,
      fieldErrors: {
        name: "Give the category a name",
        type: "Choose spending or income",
      },
    });
  });
});
