/**
 * Light / dark / system theme. The preference lives in this browser's localStorage (it is needed on the sign-in page,
 * before any account is known). The `dark` class on <html> drives the Tailwind `dark:` variant and the CSS tokens.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "finance.theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

export function isDarkTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): boolean {
  return (
    preference === "dark" || (preference === "system" && systemPrefersDark)
  );
}

/**
 * Inline in <head>, so it runs before the first paint and the page never flashes the wrong theme. It also follows
 * system changes while the preference is "system". Self-contained ES5 on purpose; tests execute this exact string.
 * When a script-src CSP is added, this script needs the per-request nonce.
 */
export const THEME_INIT_SCRIPT = `(function () {
  var key = ${JSON.stringify(THEME_STORAGE_KEY)};
  var media = window.matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)});
  function apply() {
    var preference = "system";
    try { preference = window.localStorage.getItem(key) || "system"; } catch (e) {}
    var dark = preference === "dark" || (preference !== "light" && media.matches);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", function (event) { if (event.key === key) apply(); });
})();`;
