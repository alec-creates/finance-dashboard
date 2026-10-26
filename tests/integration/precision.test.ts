import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fromDatabaseDate,
  parseCalendarDate,
  toDatabaseDate,
} from "../../src/lib/dates";
import { toDecimal, toQuantity } from "../../src/lib/decimal";
import { marketValueCents } from "../../src/lib/investments";

import { createTestPrisma, createUser, resetDatabase } from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

describe("values round-trip through PostgreSQL exactly", () => {
  let userId: string;
  let accountId: string;
  let assetId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    userId = (await createUser(prisma, "precision")).id;
    accountId = (
      await prisma.financialAccount.create({
        data: {
          userId,
          name: "Crypto",
          type: "INVESTMENT",
          investmentType: "CRYPTO_EXCHANGE",
        },
      })
    ).id;
    assetId = (
      await prisma.asset.create({
        data: { symbol: "PRECISE", name: "Precise Coin", assetClass: "CRYPTO" },
      })
    ).id;
  });

  it("keeps 18-decimal quantities and 10-decimal prices exact", async () => {
    const quantity = "0.123456789012345678";
    const price = "65432.1234567891";
    const saved = await prisma.holdingSnapshot.create({
      data: {
        userId,
        accountId,
        assetId,
        asOfDate: toDatabaseDate(parseCalendarDate("2026-03-31")),
        quantity,
        priceUsed: price,
        source: "MANUAL",
      },
    });
    const read = await prisma.holdingSnapshot.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(toDecimal(read.quantity).toFixed()).toBe(quantity);
    expect(toDecimal(read.priceUsed ?? "0").toFixed()).toBe(price);
    // Values read back feed straight into the decimal helpers.
    expect(marketValueCents(read.quantity, read.priceUsed ?? "0")).toBe(
      marketValueCents(quantity, price),
    );
    expect(toQuantity(read.quantity).equals(toQuantity(quantity))).toBe(true);
  });

  it("stores calendar dates without time-zone drift", async () => {
    for (const value of [
      "2026-01-01",
      "2026-03-08",
      "2026-11-01",
      "2028-02-29",
      "2026-12-31",
    ]) {
      const date = parseCalendarDate(value);
      const row = await prisma.balanceSnapshot.create({
        data: {
          userId,
          accountId,
          asOfDate: toDatabaseDate(date),
          balanceCents: -42_000,
          source: "MANUAL",
        },
      });
      const read = await prisma.balanceSnapshot.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(fromDatabaseDate(read.asOfDate)).toBe(value);
      expect(read.balanceCents).toBe(-42_000);
    }
  });
});
