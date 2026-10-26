import { describe, expect, it, vi } from "vitest";

import {
  isDarkTheme,
  parseThemePreference,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

describe("parseThemePreference", () => {
  it("accepts the three known preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("falls back to system for anything else", () => {
    for (const value of [null, undefined, "", "DARK", "blue", 1, {}]) {
      expect(parseThemePreference(value)).toBe("system");
    }
  });
});

describe("isDarkTheme", () => {
  it("uses an explicit choice regardless of the system setting", () => {
    expect(isDarkTheme("dark", false)).toBe(true);
    expect(isDarkTheme("light", true)).toBe(false);
  });

  it("follows the system when the preference is system", () => {
    expect(isDarkTheme("system", true)).toBe(true);
    expect(isDarkTheme("system", false)).toBe(false);
  });
});

/** Runs the real inline script against a minimal fake browser. */
function runInitScript(options: {
  stored?: string | null;
  storageThrows?: boolean;
  systemDark: boolean;
}) {
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle: (name: string, on: boolean) =>
        on ? classes.add(name) : classes.delete(name),
    },
    style: { colorScheme: "" },
  };
  const media = {
    matches: options.systemDark,
    listeners: [] as Array<() => void>,
    addEventListener(_type: string, listener: () => void) {
      this.listeners.push(listener);
    },
  };
  const storageListeners: Array<(event: { key: string }) => void> = [];
  let stored = options.stored ?? null;
  const window = {
    matchMedia: vi.fn(() => media),
    localStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) {
          throw new Error("blocked");
        }
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    },
    addEventListener: (
      _type: string,
      listener: (event: { key: string }) => void,
    ) => storageListeners.push(listener),
  };
  new Function("window", "document", THEME_INIT_SCRIPT)(window, {
    documentElement: root,
  });
  return {
    isDark: () => classes.has("dark"),
    colorScheme: () => root.style.colorScheme,
    setSystemDark(dark: boolean) {
      media.matches = dark;
      media.listeners.forEach((listener) => listener());
    },
    storeFromOtherTab(value: string) {
      stored = value;
      storageListeners.forEach((listener) =>
        listener({ key: THEME_STORAGE_KEY }),
      );
    },
  };
}

describe("THEME_INIT_SCRIPT", () => {
  it("applies a stored preference before first paint", () => {
    const dark = runInitScript({ stored: "dark", systemDark: false });
    expect(dark.isDark()).toBe(true);
    expect(dark.colorScheme()).toBe("dark");

    const light = runInitScript({ stored: "light", systemDark: true });
    expect(light.isDark()).toBe(false);
    expect(light.colorScheme()).toBe("light");
  });

  it("follows the system with no stored or an unknown preference", () => {
    expect(runInitScript({ systemDark: true }).isDark()).toBe(true);
    expect(runInitScript({ stored: "blue", systemDark: true }).isDark()).toBe(
      true,
    );
    expect(runInitScript({ systemDark: false }).isDark()).toBe(false);
  });

  it("still follows the system when storage is blocked", () => {
    expect(
      runInitScript({ storageThrows: true, systemDark: true }).isDark(),
    ).toBe(true);
  });

  it("tracks system changes only while the preference is system", () => {
    const system = runInitScript({ systemDark: false });
    system.setSystemDark(true);
    expect(system.isDark()).toBe(true);

    const pinned = runInitScript({ stored: "light", systemDark: false });
    pinned.setSystemDark(true);
    expect(pinned.isDark()).toBe(false);
  });

  it("applies a choice made in another tab", () => {
    const page = runInitScript({ systemDark: false });
    page.storeFromOtherTab("dark");
    expect(page.isDark()).toBe(true);
  });
});
