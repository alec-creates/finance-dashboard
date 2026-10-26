import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { getServerEnv } from "../env";
import { normalizeConnectionString } from "./environment";

/** Creates a Prisma client over the pg driver adapter for an explicit connection string. */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizeConnectionString(connectionString),
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The app's shared client, using the pooled DATABASE_URL. Reused across hot reloads in development so connections
 * are not exhausted.
 */
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient(getServerEnv().DATABASE_URL);
  return globalForPrisma.prisma;
}
