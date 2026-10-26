import type { PrismaClient } from "@/generated/prisma/client";

/** A user's open financial accounts. userId always comes from the authenticated session, never from the client. */
export async function listAccounts(prisma: PrismaClient, userId: string) {
  return prisma.financialAccount.findMany({
    where: { userId, archivedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      investmentType: true,
      institutionName: true,
      mask: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}
