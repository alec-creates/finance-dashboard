import { afterEach, describe, expect, it, vi } from "vitest";

import { isActivePath, navigateWithFullReload } from "./navigation";

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

describe("isActivePath", () => {
  it("matches the overview only on the root path", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/transactions", "/")).toBe(false);
  });

  it("matches a section and its sub-pages", () => {
    expect(isActivePath("/settings", "/settings")).toBe(true);
    expect(isActivePath("/settings/security", "/settings")).toBe(true);
  });

  it("does not match look-alike paths or other sections", () => {
    expect(isActivePath("/settings-old", "/settings")).toBe(false);
    expect(isActivePath("/accounts", "/settings")).toBe(false);
    expect(isActivePath("/", "/settings")).toBe(false);
  });
});
