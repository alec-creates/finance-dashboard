/** Emails are compared trimmed and case-insensitively. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True only for the configured owner address. An empty owner configuration matches nothing. */
export function isOwnerEmail(email: unknown, ownerEmail: string): boolean {
  if (typeof email !== "string" || ownerEmail.trim() === "") {
    return false;
  }
  return normalizeEmail(email) === normalizeEmail(ownerEmail);
}

/**
 * Messages returned by the server. They never say whether an email is the owner's, whether an account exists, or
 * which part of a credential was wrong.
 */
export const AUTH_SERVER_MESSAGES = {
  signUpUnavailable: "Account creation is not available.",
  signInFailed: "Invalid email or password",
} as const;
