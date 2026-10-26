import { getPrisma } from "../db/client";

import { createAuth, type Auth } from "./config";
import { getAuthEnv } from "./env";

let instance: Auth | undefined;

/** The app's Better Auth instance, created on first use so builds without credentials still succeed. */
export function getAuth(): Auth {
  if (!instance) {
    const env = getAuthEnv();
    instance = createAuth({
      prisma: getPrisma(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      ownerEmail: env.OWNER_EMAIL,
    });
  }
  return instance;
}
