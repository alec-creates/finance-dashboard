import { afterEach, describe, expect, it, vi } from "vitest";

import { navigateWithFullReload } from "./navigation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("navigateWithFullReload", () => {
  it("replaces the document instead of using client-side navigation", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    navigateWithFullReload("/sign-in");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/sign-in");
  });
});
