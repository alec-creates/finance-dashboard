import type { PrismaClient } from "@/generated/prisma/client";

import { SYNTHETIC_PRICE_SOURCE, type SyntheticDataset } from "./generate";

const CHUNK_SIZE = 1_000;

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    await insert(rows.slice(index, index + CHUNK_SIZE));
  }
}

export interface PersistResult {
  counts: Record<string, number>;
}

/**
 * Writes a synthetic dataset. Shared reference data (assets, prices marked SYNTHETIC) is upserted; everything owned
 * by the user is replaced inside one database transaction, so the deferred split and allocation checks run once at
 * commit. Only the dataset's own user is deleted first, matched by its id and email.
 */
export async function persistSyntheticDataset(
  prisma: PrismaClient,
  data: SyntheticDataset,
): Promise<PersistResult> {
  // Assets are shared reference data; reuse an existing row if the symbol already exists.
  const assetIdMap = new Map<string, string>();
  for (const asset of data.assets) {
    const saved = await prisma.asset.upsert({
      where: {
        assetClass_symbol: {
          assetClass: asset.assetClass,
          symbol: asset.symbol,
        },
      },
      create: asset,
      update: {},
    });
    assetIdMap.set(asset.id ?? "", saved.id);
  }
  const mapAsset = (id: string | null | undefined) =>
    id ? (assetIdMap.get(id) ?? id) : id;
  const assetIds = [...assetIdMap.values()];

  await prisma.assetPrice.deleteMany({
    where: { assetId: { in: assetIds }, source: SYNTHETIC_PRICE_SOURCE },
  });
  await insertInChunks(
    data.prices.map((price) => ({
      ...price,
      assetId: mapAsset(price.assetId) ?? price.assetId,
    })),
    (chunk) => prisma.assetPrice.createMany({ data: chunk }),
  );

  const userId = data.user.id;
  if (!userId) {
    throw new Error("Synthetic dataset has no user id");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.user.deleteMany({
        where: { OR: [{ id: userId }, { email: data.user.email }] },
      });
      await tx.user.create({ data: data.user });
      await tx.userSettings.create({ data: data.userSettings });
      await tx.safeToSpendSettings.create({ data: data.safeToSpendSettings });

      const steps: [string, unknown[], (rows: never[]) => Promise<unknown>][] =
        [
          [
            "accounts",
            data.accounts,
            (rows) => tx.financialAccount.createMany({ data: rows }),
          ],
          [
            "categories",
            data.categories,
            (rows) => tx.category.createMany({ data: rows }),
          ],
          [
            "merchants",
            data.merchants,
            (rows) => tx.merchant.createMany({ data: rows }),
          ],
          [
            "rules",
            data.rules,
            (rows) => tx.categorizationRule.createMany({ data: rows }),
          ],
          [
            "incomeSources",
            data.incomeSources,
            (rows) => tx.incomeSource.createMany({ data: rows }),
          ],
          [
            "recurringSeries",
            data.recurringSeries,
            (rows) => tx.recurringSeries.createMany({ data: rows }),
          ],
          [
            "contributionPlans",
            data.contributionPlans,
            (rows) => tx.contributionPlan.createMany({ data: rows }),
          ],
          [
            "contributionAllocations",
            data.contributionAllocations,
            (rows) => tx.contributionAllocation.createMany({ data: rows }),
          ],
          [
            "contributionOverrides",
            data.contributionOverrides,
            (rows) => tx.contributionOverride.createMany({ data: rows }),
          ],
          [
            "transactions",
            data.transactions,
            (rows) => tx.transaction.createMany({ data: rows }),
          ],
          [
            "splits",
            data.splits,
            (rows) => tx.transactionSplit.createMany({ data: rows }),
          ],
          [
            "investmentTransactions",
            data.investmentTransactions.map((row) => ({
              ...row,
              assetId: mapAsset(row.assetId),
              feeAssetId: mapAsset(row.feeAssetId),
            })),
            (rows) => tx.investmentTransaction.createMany({ data: rows }),
          ],
          [
            "holdingSnapshots",
            data.holdingSnapshots.map((row) => ({
              ...row,
              assetId: mapAsset(row.assetId) ?? row.assetId,
            })),
            (rows) => tx.holdingSnapshot.createMany({ data: rows }),
          ],
          [
            "portfolioValuations",
            data.portfolioValuations,
            (rows) => tx.portfolioValuation.createMany({ data: rows }),
          ],
          [
            "balanceSnapshots",
            data.balanceSnapshots,
            (rows) => tx.balanceSnapshot.createMany({ data: rows }),
          ],
          [
            "budgets",
            data.budgets,
            (rows) => tx.budget.createMany({ data: rows }),
          ],
          [
            "savingsGoals",
            data.savingsGoals,
            (rows) => tx.savingsGoal.createMany({ data: rows }),
          ],
          [
            "goalLedgerEntries",
            data.goalLedgerEntries,
            (rows) => tx.goalLedgerEntry.createMany({ data: rows }),
          ],
          [
            "forecastScenarios",
            data.forecastScenarios,
            (rows) => tx.forecastScenario.createMany({ data: rows }),
          ],
          [
            "netWorthSnapshots",
            data.netWorthSnapshots,
            (rows) => tx.netWorthSnapshot.createMany({ data: rows }),
          ],
        ];
      for (const [, rows, insert] of steps) {
        await insertInChunks(rows as never[], insert);
      }
    },
    { maxWait: 30_000, timeout: 600_000 },
  );

  const counts: Record<string, number> = {
    assets: data.assets.length,
    prices: data.prices.length,
  };
  for (const [name, rows] of Object.entries(data)) {
    if (Array.isArray(rows)) {
      counts[name] = rows.length;
    }
  }
  return { counts };
}
