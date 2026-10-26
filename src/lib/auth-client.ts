import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth client. Talks to /api/auth on the same origin; holds no secrets. The sign-in form routes to the
 * two-factor step itself when the server asks for a code.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
