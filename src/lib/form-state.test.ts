import { describe, expect, it } from "vitest";

import { formValues } from "./form-state";

describe("formValues", () => {
  it("keeps the first value of each text field and drops React's internal fields", () => {
    const form = new FormData();
    form.append("name", "Checking");
    form.append("splitAmount", "1.00");
    form.append("splitAmount", "2.00");
    form.append("$ACTION_ID_abc", "");
    form.append("file", new Blob(["x"]));
    expect(formValues(form)).toEqual({ name: "Checking", splitAmount: "1.00" });
  });
});
