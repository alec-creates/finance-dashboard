import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SIGN_IN_PATH, TWO_FACTOR_SETUP_PATH } from "./constants";
import { getUserFromHeaders, type AuthenticatedUser } from "./request";

/**
 * Data access layer for Server Components and Server Actions. Every page that shows or changes financial data calls
 * requireUser(), even though the proxy and layouts also check: they are conveniences, this is the real check.
 */
export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> =>
    getUserFromHeaders(await headers()),
);

export async function requireUser(
  options: { allowWithoutTwoFactor?: boolean } = {},
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(SIGN_IN_PATH);
  }
  if (!user.twoFactorEnabled && !options.allowWithoutTwoFactor) {
    redirect(TWO_FACTOR_SETUP_PATH);
  }
  return user;
}
