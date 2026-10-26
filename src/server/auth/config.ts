import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";

import type { PrismaClient } from "@/generated/prisma/client";

import {
  AUTH_COOKIE_PREFIX,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "./constants";
import { AUTH_SERVER_MESSAGES, isOwnerEmail } from "./owner";

export interface CreateAuthOptions {
  prisma: PrismaClient;
  secret: string;
  baseURL: string;
  /** The only address allowed to create the account or sign in. */
  ownerEmail: string;
  /**
   * Check new passwords against known breaches (Have I Been Pwned, k-anonymity: only a hash prefix leaves the
   * server). Tests turn it off to stay offline.
   */
  checkBreachedPasswords?: boolean;
}

/**
 * True once anyone can sign in: a sign-in method (password) exists. Users without one, such as the synthetic demo
 * user created by the seed, never count, and can never sign in.
 */
export async function ownerAccountExists(
  prisma: PrismaClient,
): Promise<boolean> {
  return (await prisma.account.count()) > 0;
}

/**
 * Better Auth configuration (ADR-0010). Uses only built-in features: email and password, the two-factor (TOTP)
 * plugin, database sessions, database-backed rate limiting, and hooks to restrict accounts to the owner.
 */
export function createAuth(options: CreateAuthOptions) {
  const { prisma, ownerEmail } = options;
  const ownerExists = () => ownerAccountExists(prisma);
  const signUpUnavailable = () =>
    new APIError("FORBIDDEN", {
      message: AUTH_SERVER_MESSAGES.signUpUnavailable,
    });

  return betterAuth({
    appName: "Finance Dashboard",
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [options.baseURL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
      // No email service is configured; the single owner account is created from a known, configured address.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },

    // Sessions live in the database (no cookie cache), so signing out or revoking a session takes effect at once on
    // every device.
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 3600, max: 5 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },

    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: options.baseURL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },

    hooks: {
      // Reject sign-up before any work is done unless it is the owner's first account.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/sign-up")) {
          const email = (ctx.body as { email?: unknown } | undefined)?.email;
          if (!isOwnerEmail(email, ownerEmail) || (await ownerExists())) {
            throw signUpUnavailable();
          }
        }
      }),
    },

    databaseHooks: {
      user: {
        create: {
          // Defense in depth: no code path can create a second user or a non-owner user.
          before: async (user) => {
            if (
              !isOwnerEmail(user.email, ownerEmail) ||
              (await ownerExists())
            ) {
              throw signUpUnavailable();
            }
          },
        },
        update: {
          before: async (data) => {
            if (
              typeof data.email === "string" &&
              !isOwnerEmail(data.email, ownerEmail)
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Email changes are not available.",
              });
            }
          },
        },
      },
      session: {
        create: {
          // Only the configured owner can hold a session, even if OWNER_EMAIL changes after an account exists.
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { email: true },
            });
            if (!user || !isOwnerEmail(user.email, ownerEmail)) {
              throw new APIError("UNAUTHORIZED", {
                message: AUTH_SERVER_MESSAGES.signInFailed,
              });
            }
          },
        },
      },
    },

    plugins: [
      twoFactor({ issuer: "Finance Dashboard" }),
      haveIBeenPwned({
        customPasswordCompromisedMessage:
          "This password appears in a known data breach. Choose a different one.",
        // An empty list disables the check (tests).
        ...(options.checkBreachedPasswords === false ? { paths: [] } : {}),
      }),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
