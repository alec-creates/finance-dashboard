/**
 * Shared, dependency-free auth constants (safe to import from the proxy and client code).
 */
export const AUTH_COOKIE_PREFIX = "finance";

/** Sessions last 7 days and slide forward at most once a day while in use. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Pages anyone can open; everything else requires a session. */
export const PUBLIC_PATHS = ["/sign-in", "/two-factor", "/setup"] as const;

/**
 * Static app metadata that browsers fetch without cookies (the PWA manifest, icons). Matched exactly; they contain no
 * user data.
 */
export const PUBLIC_FILES = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
] as const;

export const SIGN_IN_PATH = "/sign-in";
export const TWO_FACTOR_SETUP_PATH = "/security/two-factor";
