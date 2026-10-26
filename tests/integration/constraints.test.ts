import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createCategory,
  createCheckingAccount,
  createTestPrisma,
  createUser,
  expectRejected,
  resetDatabase,
} from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("database constraints", () => {
  let userId: string;
  let checkingId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createUser(prisma, "constraints")).id;
    checkingId = (await createCheckingAccount(prisma, userId)).id;
  });

  it("requires an investment type exactly for investment accounts", async () => {
    await expectRejected(
      prisma.financialAccount.create({
        data: { userId, name: "Brokerage", type: "INVESTMENT" },
      }),
      /FinancialAccount_investment_type_check/,
    );
    await expectRejected(
      prisma.financialAccount.create({
        data: {
          userId,
          name: "Checking 2",
          type: "CHECKING",
          investmentType: "ROTH_IRA",
        },
      }),
      /FinancialAccount_investment_type_check/,
    );
    const roth = await prisma.financialAccount.create({
      data: {
        userId,
        name: "Roth IRA",
        type: "INVESTMENT",
        investmentType: "ROTH_IRA",
      },
    });
    expect(roth.investmentType).toBe("ROTH_IRA");
  });

  it("allows Safe to Spend only on cash accounts and only USD", async () => {
    await expectRejected(
      prisma.financialAccount.create({
        data: {
          userId,
          name: "Card",
          type: "CREDIT_CARD",
          includeInSafeToSpend: true,
        },
      }),
      /safe_to_spend_cash_only_check/,
    );
    await expectRejected(
      prisma.financialAccount.create({
        data: { userId, name: "Euro", type: "CHECKING", currency: "EUR" },
      }),
      /currency_usd_check/,
    );
    await expectRejected(
      prisma.financialAccount.update({
        where: { id: checkingId },
        data: { minimumBalanceCents: -1 },
      }),
      /minimum_balance_check/,
    );
  });

  it("requires budgets to start on the first of a month and be non-negative", async () => {
    const category = await createCategory(prisma, userId, "Groceries");
    await expectRejected(
      prisma.budget.create({
        data: {
          userId,
          categoryId: category.id,
          month: day("2026-03-15"),
          amountCents: 100,
        },
      }),
      /Budget_first_of_month_check/,
    );
    await expectRejected(
      prisma.budget.create({
        data: {
          userId,
          categoryId: category.id,
          month: day("2026-03-01"),
          amountCents: -1,
        },
      }),
      /Budget_amount_check/,
    );
    await prisma.budget.create({
      data: {
        userId,
        categoryId: category.id,
        month: day("2026-03-01"),
        amountCents: 35_000,
      },
    });
  });

  it("keeps category names unique per parent, ignoring case, including top-level names", async () => {
    const food = await createCategory(prisma, userId, "Food");
    await expectRejected(
      createCategory(prisma, userId, "food"),
      /Category_userId_parentId_lower_name_key|P2002|23505/,
    );
    await createCategory(prisma, userId, "Groceries", food.id);
    await expectRejected(
      createCategory(prisma, userId, "GROCERIES", food.id),
      /lower_name_key|P2002|23505/,
    );
    await createCategory(prisma, userId, "Groceries"); // same name under a different parent is fine
  });

  it("enforces contribution plan shapes and share ranges", async () => {
    const base = {
      userId,
      name: "Plan",
      sourceAccountId: checkingId,
      effectiveFrom: day("2026-01-01"),
    };
    await expectRejected(
      prisma.contributionPlan.create({
        data: {
          ...base,
          ruleType: "FIXED_AMOUNT",
          schedule: { frequency: "monthly", dayOfMonth: 1 },
        },
      }),
      /ContributionPlan_fixed_amount_check/,
    );
    await expectRejected(
      prisma.contributionPlan.create({
        data: {
          ...base,
          ruleType: "PERCENT_OF_INCOME",
          percent: "1.5",
          schedule: { frequency: "monthly", dayOfMonth: 1 },
        },
      }),
      /ContributionPlan_percent_check|numeric field overflow|22003/,
    );
    await expectRejected(
      prisma.contributionPlan.create({
        data: { ...base, ruleType: "PERCENT_OF_PAYCHECK", percent: "0.2" },
      }),
      /ContributionPlan_paycheck_source_check/,
    );
    await expectRejected(
      prisma.contributionPlan.create({
        data: { ...base, ruleType: "PERCENT_OF_INCOME", percent: "0.2" },
      }),
      /ContributionPlan_schedule_check/,
    );
    const plan = await prisma.contributionPlan.create({
      data: {
        ...base,
        ruleType: "PERCENT_OF_INCOME",
        percent: "0.2",
        schedule: { frequency: "weekly", anchorDate: "2026-01-02" },
      },
    });
    await expectRejected(
      prisma.contributionOverride.create({
        data: {
          userId,
          planId: plan.id,
          scheduledDate: day("2026-01-09"),
          skip: true,
          amountCents: 100,
        },
      }),
      /ContributionOverride_skip_or_amount_check/,
    );
  });

  it("checks investment transaction directions and required values", async () => {
    const asset = await prisma.asset.create({
      data: { symbol: "TESTX", name: "Test ETF", assetClass: "ETF" },
    });
    const brokerage = await prisma.financialAccount.create({
      data: {
        userId,
        name: "Brokerage",
        type: "INVESTMENT",
        investmentType: "TAXABLE_BROKERAGE",
      },
    });
    const base = {
      userId,
      accountId: brokerage.id,
      tradeDate: day("2026-02-02"),
      fingerprint: "fp",
    };
    await expectRejected(
      prisma.investmentTransaction.create({
        data: {
          ...base,
          type: "BUY",
          assetId: asset.id,
          quantity: "1",
          cashAmountCents: 1000,
        },
      }),
      /cash_direction_check/,
    );
    await expectRejected(
      prisma.investmentTransaction.create({
        data: { ...base, type: "BUY", cashAmountCents: -1000 },
      }),
      /trade_needs_asset_check/,
    );
    await expectRejected(
      prisma.investmentTransaction.create({
        data: {
          ...base,
          type: "STAKING_REWARD",
          assetId: asset.id,
          quantity: "0.1",
        },
      }),
      /reward_value_check/,
    );
    await expectRejected(
      prisma.investmentTransaction.create({
        data: {
          ...base,
          type: "BUY",
          assetId: asset.id,
          quantity: "-1",
          cashAmountCents: -100,
        },
      }),
      /magnitudes_check|trade_needs_asset_check/,
    );
    await expectRejected(
      prisma.investmentTransaction.create({
        data: {
          ...base,
          type: "WITHDRAWAL",
          cashAmountCents: -100,
          contributionTaxYear: 2026,
        },
      }),
      /tax_year_check/,
    );
    await prisma.investmentTransaction.create({
      data: {
        ...base,
        type: "BUY",
        assetId: asset.id,
        quantity: "0.123456",
        unitPrice: "100.25",
        cashAmountCents: -1238,
        feeCents: 0,
      },
    });
    await prisma.asset
      .delete({ where: { id: asset.id } })
      .catch(() => undefined);
  });

  it("checks goal ledger signs and net worth signs", async () => {
    const goal = await prisma.savingsGoal.create({
      data: { userId, name: "Goal", targetCents: 100_000 },
    });
    const entry = {
      userId,
      goalId: goal.id,
      accountId: checkingId,
      date: day("2026-01-01"),
    };
    await expectRejected(
      prisma.goalLedgerEntry.create({
        data: { ...entry, amountCents: -100, type: "ALLOCATE" },
      }),
      /GoalLedgerEntry_sign_check/,
    );
    await expectRejected(
      prisma.goalLedgerEntry.create({
        data: { ...entry, amountCents: 100, type: "WITHDRAW" },
      }),
      /GoalLedgerEntry_sign_check/,
    );
    await expectRejected(
      prisma.netWorthSnapshot.create({
        data: {
          userId,
          asOfDate: day("2026-01-31"),
          assetsCents: 100,
          liabilitiesCents: 50,
          cashCents: 0,
          investmentsCents: 0,
          otherAssetsCents: 0,
          completeness: {},
        },
      }),
      /NetWorthSnapshot_signs_check/,
    );
  });
});
