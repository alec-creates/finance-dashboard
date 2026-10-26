import { MIN_PASSWORD_LENGTH } from "@/server/auth/constants";

export interface AuthErrorLike {
  status?: number;
  code?: string;
}

export type AuthAction =
  "signIn" | "signUp" | "twoFactor" | "enableTwoFactor" | "general";

/**
 * Turns an auth error into a message for the user. Messages never reveal whether an account exists, whether an email
 * is the owner's, or which part of a credential was wrong, and never echo what was typed.
 */
export function describeAuthError(
  error: AuthErrorLike | null | undefined,
  action: AuthAction = "general",
): string {
  if (!error) {
    return "";
  }
  if (error.status === 429) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Incorrect email or password.";
    case "INVALID_PASSWORD":
      return "Incorrect password.";
    case "PASSWORD_TOO_SHORT":
      return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    case "PASSWORD_COMPROMISED":
      return "This password appears in a known data breach. Choose a different one.";
    case "INVALID_CODE":
    case "OTP_HAS_EXPIRED":
      return "That code didn't work. Check your authenticator app and try again.";
    case "INVALID_BACKUP_CODE":
      return "That backup code didn't work, or it has already been used.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many incorrect codes. Try again in 15 minutes.";
    case "INVALID_TWO_FACTOR_COOKIE":
    case "SESSION_EXPIRED":
      return "Your sign-in timed out. Start again.";
  }
  if (action === "signUp" && error.status === 403) {
    return "Account creation is not available.";
  }
  if (action === "signIn" && (error.status === 401 || error.status === 403)) {
    return "Incorrect email or password.";
  }
  if (action === "twoFactor" && error.status === 401) {
    return "That code didn't work. Check your authenticator app and try again.";
  }
  return "Something went wrong. Please try again.";
}
