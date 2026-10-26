import { describe, expect, it } from "vitest";

import { visibleFieldErrors } from "./form-errors";

describe("visibleFieldErrors", () => {
  const errors = { name: "Give the account a name", mask: "Digits only" };

  it("shows every error before anything is edited", () => {
    expect(visibleFieldErrors(errors, new Set())).toEqual(errors);
  });

  it("hides only the error of the edited field", () => {
    expect(visibleFieldErrors(errors, new Set(["name"]))).toEqual({
      mask: "Digits only",
    });
  });

  it("hides errors of fields that depend on the edited one", () => {
    const balanceErrors = { cash: "Cash must be between zero and the total" };
    expect(
      visibleFieldErrors(balanceErrors, new Set(["amount"]), {
        amount: ["cash"],
      }),
    ).toEqual({});
    expect(
      visibleFieldErrors(balanceErrors, new Set(["asOfDate"]), {
        amount: ["cash"],
      }),
    ).toEqual(balanceErrors);
  });

  it("ignores edits to fields without errors and empty messages", () => {
    expect(
      visibleFieldErrors({ name: "", mask: "Digits only" }, new Set(["type"])),
    ).toEqual({ mask: "Digits only" });
  });
});
