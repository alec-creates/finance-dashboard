/**
 * Full document navigation for authentication boundaries (sign-in, two-factor, account setup, sign-out).
 *
 * With Cache Components, Next.js keeps visited pages alive but hidden (React <Activity>) instead of unmounting them.
 * Across an auth boundary that would leave stale UI state (a "Signing out…" button), typed passwords in hidden forms,
 * or, after sign-out, a hidden page that still contains financial data. A full load discards all of it and renders
 * from the server with the new session. `replace` also keeps the previous page out of the Back history.
 */
export function navigateWithFullReload(path: `/${string}`): void {
  window.location.replace(path);
}

/**
 * Whether a navigation item for `href` is the current section. "/" matches only itself; other items also match their
 * sub-pages ("/settings" for "/settings/security"), never a look-alike ("/settings" for "/settings-old").
 */
export function isActivePath(pathname: string, href: `/${string}`): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
