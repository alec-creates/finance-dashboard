import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  planContributions,
  splitContribution,
  type DatedAmount,
} from "@/lib/contributions";
import {
  addDays,
  addMonthsToYearMonth,
  dateParts,
  dayOfWeek,
  firstDayOfMonth,
  lastDayOfMonth,
  monthsInRange,
  toDatabaseDate,
  yearMonthOf,
  type CalendarDate,
} from "@/lib/dates";
import { Decimal, roundDecimal, toDecimal } from "@/lib/decimal";
import { marketValueCents } from "@/lib/investments";
import { allocateCents, multiplyCents, percentOfCents } from "@/lib/money";
import {
  nextOccurrence,
  occurrencesBetween,
  type Schedule,
} from "@/lib/schedules";

import { createRandom } from "./random";

/**
 * Deterministic synthetic financial history for development, tests and demos. Every name, amount and institution is
 * invented. All money math goes through src/lib so the data follows the same rules as the app:
 * signed amounts (owner's view), integer cents, exact decimals for quantities and prices.
 */

export interface SyntheticOptions {
  userId: string;
  email: string;
  name?: string;
  /** Last day of generated history (inclusive). */
  endDate: CalendarDate;
  /** Calendar months of history, ending with endDate's month. */
  months?: number;
  seed?: number;
}

export interface SyntheticDataset {
  user: Prisma.UserCreateManyInput;
  userSettings: Prisma.UserSettingsCreateManyInput;
  safeToSpendSettings: Prisma.SafeToSpendSettingsCreateManyInput;
  accounts: Prisma.FinancialAccountCreateManyInput[];
  categories: Prisma.CategoryCreateManyInput[];
  merchants: Prisma.MerchantCreateManyInput[];
  rules: Prisma.CategorizationRuleCreateManyInput[];
  incomeSources: Prisma.IncomeSourceCreateManyInput[];
  recurringSeries: Prisma.RecurringSeriesCreateManyInput[];
  contributionPlans: Prisma.ContributionPlanCreateManyInput[];
  contributionAllocations: Prisma.ContributionAllocationCreateManyInput[];
  contributionOverrides: Prisma.ContributionOverrideCreateManyInput[];
  transactions: Prisma.TransactionCreateManyInput[];
  splits: Prisma.TransactionSplitCreateManyInput[];
  assets: Prisma.AssetCreateManyInput[];
  prices: Prisma.AssetPriceCreateManyInput[];
  investmentTransactions: Prisma.InvestmentTransactionCreateManyInput[];
  holdingSnapshots: Prisma.HoldingSnapshotCreateManyInput[];
  portfolioValuations: Prisma.PortfolioValuationCreateManyInput[];
  balanceSnapshots: Prisma.BalanceSnapshotCreateManyInput[];
  budgets: Prisma.BudgetCreateManyInput[];
  savingsGoals: Prisma.SavingsGoalCreateManyInput[];
  goalLedgerEntries: Prisma.GoalLedgerEntryCreateManyInput[];
  forecastScenarios: Prisma.ForecastScenarioCreateManyInput[];
  netWorthSnapshots: Prisma.NetWorthSnapshotCreateManyInput[];
}

/** Marks prices generated here, so seeding can replace them without touching real price history. */
export const SYNTHETIC_PRICE_SOURCE = "SYNTHETIC";

type TxnKind = Prisma.TransactionCreateManyInput["kind"];

// ---------------------------------------------------------------------------------------------------------------------
// Reference data (all invented)

const ACCOUNTS = {
  checking: {
    name: "Everyday Checking",
    type: "CHECKING",
    institution: "Example Community Bank",
    mask: "0101",
  },
  savings: {
    name: "High-Yield Savings",
    type: "SAVINGS",
    institution: "Example Community Bank",
    mask: "0202",
  },
  card: {
    name: "Rewards Card",
    type: "CREDIT_CARD",
    institution: "Example Card Co.",
    mask: "0303",
  },
  brokerage: {
    name: "Brokerage",
    type: "INVESTMENT",
    institution: "Example Brokerage",
    investmentType: "TAXABLE_BROKERAGE",
  },
  roth: {
    name: "Roth IRA",
    type: "INVESTMENT",
    institution: "Example Brokerage",
    investmentType: "ROTH_IRA",
  },
  crypto: {
    name: "Crypto Exchange",
    type: "INVESTMENT",
    institution: "Example Exchange",
    investmentType: "CRYPTO_EXCHANGE",
  },
} as const;
type AccountKey = keyof typeof ACCOUNTS;
type InvestmentAccountKey = "brokerage" | "roth" | "crypto";

const CATEGORY_TREE = [
  {
    key: "housing",
    name: "Housing",
    type: "EXPENSE",
    children: [
      { key: "rent", name: "Rent", essential: true },
      { key: "utilities", name: "Utilities", essential: true },
    ],
  },
  {
    key: "food",
    name: "Food",
    type: "EXPENSE",
    children: [
      { key: "groceries", name: "Groceries", essential: true },
      { key: "restaurants", name: "Restaurants", essential: false },
    ],
  },
  {
    key: "transportation",
    name: "Transportation",
    type: "EXPENSE",
    children: [
      { key: "gas", name: "Gas", essential: true },
      { key: "carMaintenance", name: "Car Maintenance", essential: true },
    ],
  },
  {
    key: "lifestyle",
    name: "Lifestyle",
    type: "EXPENSE",
    children: [
      { key: "entertainment", name: "Entertainment", essential: false },
      { key: "shopping", name: "Shopping", essential: false },
      { key: "subscriptions", name: "Subscriptions", essential: false },
    ],
  },
  {
    key: "health",
    name: "Health",
    type: "EXPENSE",
    essential: true,
    children: [],
  },
  { key: "paycheck", name: "Paycheck", type: "INCOME", children: [] },
  { key: "interest", name: "Interest", type: "INCOME", children: [] },
] as const;

const MERCHANTS = {
  apartments: { name: "Maple Court Apartments", category: "rent" },
  utility: { name: "City Power & Water", category: "utilities" },
  phone: { name: "Bright Mobile", category: "utilities" },
  streamflix: { name: "StreamFlix", category: "subscriptions" },
  tunebox: { name: "TuneBox Music", category: "subscriptions" },
  cloudvault: { name: "CloudVault Storage", category: "subscriptions" },
  freshMarket: { name: "Fresh Market", category: "groceries" },
  valleyGrocers: { name: "Valley Grocers", category: "groceries" },
  cornerBistro: { name: "Corner Bistro", category: "restaurants" },
  tacoStand: { name: "Taco Stand", category: "restaurants" },
  noodleHouse: { name: "Noodle House", category: "restaurants" },
  fuelStop: { name: "Fuel Stop", category: "gas" },
  quickLube: { name: "Quick Lube Auto", category: "carMaintenance" },
  everydayGoods: { name: "Everyday Goods", category: "shopping" },
  onlineMart: { name: "Online Mart", category: "shopping" },
  cinemaPlus: { name: "Cinema Plus", category: "entertainment" },
  gameShop: { name: "Game Shop", category: "entertainment" },
  pharmacyOne: { name: "Pharmacy One", category: "health" },
  employer: { name: "Acme Widgets Payroll", category: "paycheck" },
} as const;
type MerchantKey = keyof typeof MERCHANTS;

const RULE_MERCHANTS: readonly MerchantKey[] = [
  "freshMarket",
  "valleyGrocers",
  "fuelStop",
  "streamflix",
  "tunebox",
  "cloudvault",
  "apartments",
  "utility",
];

const ASSETS = {
  VTI: {
    name: "Total Market ETF",
    assetClass: "ETF",
    start: "265.40",
    vol: 0.009,
    drift: 0.0003,
    decimals: 6,
  },
  VXUS: {
    name: "International ETF",
    assetClass: "ETF",
    start: "62.15",
    vol: 0.009,
    drift: 0.0002,
    decimals: 6,
  },
  MSFT: {
    name: "Example Software Co.",
    assetClass: "EQUITY",
    start: "410.20",
    vol: 0.014,
    drift: 0.0004,
    decimals: 6,
  },
  BTC: {
    name: "Bitcoin",
    assetClass: "CRYPTO",
    start: "62000.00",
    vol: 0.03,
    drift: 0.0006,
    decimals: 8,
  },
  ETH: {
    name: "Ether",
    assetClass: "CRYPTO",
    start: "3100.00",
    vol: 0.035,
    drift: 0.0005,
    decimals: 8,
  },
} as const;
type AssetSymbol = keyof typeof ASSETS;

export const SYNTHETIC_ASSET_IDS: Record<AssetSymbol, string> = {
  VTI: "synthetic-asset-vti",
  VXUS: "synthetic-asset-vxus",
  MSFT: "synthetic-asset-msft",
  BTC: "synthetic-asset-btc",
  ETH: "synthetic-asset-eth",
};

const BUDGETS_CENTS: Partial<Record<string, number>> = {
  rent: 115_000,
  utilities: 22_000,
  groceries: 45_000,
  restaurants: 15_000,
  gas: 15_000,
  carMaintenance: 10_000,
  entertainment: 8_000,
  shopping: 15_000,
  subscriptions: 5_000,
  health: 6_000,
};

// ---------------------------------------------------------------------------------------------------------------------

export function generateSyntheticDataset(
  options: SyntheticOptions,
): SyntheticDataset {
  const { userId, email, endDate, months = 18, seed = 20_261_026 } = options;
  const rng = createRandom(seed);
  const months_ = monthsInRange(
    addMonthsToYearMonth(yearMonthOf(endDate), -(months - 1)),
    yearMonthOf(endDate),
  );
  const startDate = firstDayOfMonth(months_[0] ?? yearMonthOf(endDate));
  const reviewFrom = addDays(endDate, -13);
  const pendingFrom = addDays(endDate, -1);
  const db = (date: CalendarDate) => toDatabaseDate(date);

  const counters = new Map<string, number>();
  const nextId = (type: string) => {
    const count = (counters.get(type) ?? 0) + 1;
    counters.set(type, count);
    return `${userId}-${type}-${String(count).padStart(5, "0")}`;
  };
  const accountId = (key: AccountKey) => `${userId}-account-${key}`;
  const categoryId = (key: string) => `${userId}-category-${key}`;
  const merchantId = (key: MerchantKey) => `${userId}-merchant-${key}`;

  const data: SyntheticDataset = {
    user: {
      id: userId,
      name: options.name ?? "Demo User",
      email,
      emailVerified: true,
    },
    userSettings: { userId, timeZone: "America/New_York" },
    safeToSpendSettings: { userId },
    accounts: [],
    categories: [],
    merchants: [],
    rules: [],
    incomeSources: [],
    recurringSeries: [],
    contributionPlans: [],
    contributionAllocations: [],
    contributionOverrides: [],
    transactions: [],
    splits: [],
    assets: [],
    prices: [],
    investmentTransactions: [],
    holdingSnapshots: [],
    portfolioValuations: [],
    balanceSnapshots: [],
    budgets: [],
    savingsGoals: [],
    goalLedgerEntries: [],
    forecastScenarios: [],
    netWorthSnapshots: [],
  };

  // Accounts ----------------------------------------------------------------------------------------------------------
  for (const [key, account] of Object.entries(ACCOUNTS) as [
    AccountKey,
    (typeof ACCOUNTS)[AccountKey],
  ][]) {
    data.accounts.push({
      id: accountId(key),
      userId,
      name: account.name,
      institutionName: account.institution,
      mask: "mask" in account ? account.mask : null,
      type: account.type,
      investmentType:
        "investmentType" in account ? account.investmentType : null,
      includeInSafeToSpend: key === "checking",
      minimumBalanceCents: key === "checking" ? 50_000 : null,
      historyCompleteFrom: db(startDate),
    });
  }

  // Categories, merchants, rules ----------------------------------------------------------------------------------------
  CATEGORY_TREE.forEach((parent, index) => {
    data.categories.push({
      id: categoryId(parent.key),
      userId,
      name: parent.name,
      type: parent.type,
      isEssential: "essential" in parent ? parent.essential : false,
      sortOrder: index,
    });
    parent.children.forEach((child, childIndex) => {
      data.categories.push({
        id: categoryId(child.key),
        userId,
        name: child.name,
        parentId: categoryId(parent.key),
        type: parent.type,
        isEssential: child.essential,
        sortOrder: childIndex,
      });
    });
  });
  for (const [key, merchant] of Object.entries(MERCHANTS) as [
    MerchantKey,
    (typeof MERCHANTS)[MerchantKey],
  ][]) {
    data.merchants.push({
      id: merchantId(key),
      userId,
      name: merchant.name,
      matchKey: merchant.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
      defaultCategoryId: categoryId(merchant.category),
    });
  }
  const ruleIdByMerchant = new Map<MerchantKey, string>();
  RULE_MERCHANTS.forEach((key, index) => {
    const id = nextId("rule");
    ruleIdByMerchant.set(key, id);
    data.rules.push({
      id,
      userId,
      priority: (index + 1) * 10,
      field: "DESCRIPTION",
      matchType: "CONTAINS",
      pattern: MERCHANTS[key].name.toUpperCase(),
      setCategoryId: categoryId(MERCHANTS[key].category),
      setMerchantId: merchantId(key),
    });
  });

  // Cash ledger -------------------------------------------------------------------------------------------------------
  const balances = new Map<AccountKey, number>([
    ["checking", 240_000],
    ["savings", 500_000],
    ["card", 0],
  ]);
  for (const key of ["checking", "savings", "card"] as const) {
    data.balanceSnapshots.push({
      id: nextId("balance"),
      userId,
      accountId: accountId(key),
      asOfDate: db(addDays(startDate, -1)),
      balanceCents: balances.get(key) ?? 0,
      source: "MANUAL",
    });
  }

  const fingerprintCounts = new Map<string, number>();
  const fingerprint = (parts: readonly (string | number)[]) => {
    const base = parts.join("|");
    const occurrence = (fingerprintCounts.get(base) ?? 0) + 1;
    fingerprintCounts.set(base, occurrence);
    return createHash("sha256").update(`${base}|${occurrence}`).digest("hex");
  };

  interface CashInput {
    account: AccountKey;
    date: CalendarDate;
    amountCents: number;
    description: string;
    kind: TxnKind;
    merchant?: MerchantKey;
    /** Category for a single split; omitted for kinds that have no category. */
    category?: string;
    /** Several categorized splits (must sum to amountCents). */
    splits?: { category: string; amountCents: number }[];
    transferPairId?: string;
    recurringSeriesId?: string;
    contributionPlanId?: string;
    incomeSourceId?: string;
  }

  const categorizedKinds = new Set<TxnKind>(["INCOME", "EXPENSE", "REFUND"]);
  const cash = (input: CashInput): string => {
    const id = nextId("txn");
    const categorized = categorizedKinds.has(input.kind);
    const needsReview = categorized && input.date >= reviewFrom;
    const rule = input.merchant
      ? ruleIdByMerchant.get(input.merchant)
      : undefined;
    // Recent transactions wait in the review queue; a matching rule pre-fills its suggestion.
    const keepCategory = categorized && (!needsReview || rule !== undefined);
    const description = input.merchant
      ? MERCHANTS[input.merchant].name.toUpperCase()
      : input.description;
    data.transactions.push({
      id,
      userId,
      accountId: accountId(input.account),
      date: db(input.date),
      amountCents: input.amountCents,
      description,
      merchantId: input.merchant ? merchantId(input.merchant) : null,
      kind: input.kind,
      status:
        input.account === "card" && input.date >= pendingFrom
          ? "PENDING"
          : "POSTED",
      reviewStatus: needsReview ? "NEEDS_REVIEW" : "CONFIRMED",
      categorySource: !categorized
        ? "NONE"
        : !keepCategory
          ? "NONE"
          : rule
            ? "RULE"
            : "MANUAL",
      appliedRuleId: keepCategory && rule ? rule : null,
      incomeSourceId: input.incomeSourceId ?? null,
      recurringSeriesId: input.recurringSeriesId ?? null,
      contributionPlanId: input.contributionPlanId ?? null,
      transferPairId: input.transferPairId ?? null,
      fingerprint: fingerprint([
        input.account,
        input.date,
        input.amountCents,
        description,
      ]),
    });
    const splits = input.splits ?? [
      { category: input.category ?? "", amountCents: input.amountCents },
    ];
    for (const split of splits) {
      data.splits.push({
        id: nextId("split"),
        userId,
        transactionId: id,
        categoryId:
          keepCategory && split.category ? categoryId(split.category) : null,
        amountCents: split.amountCents,
      });
    }
    balances.set(
      input.account,
      (balances.get(input.account) ?? 0) + input.amountCents,
    );
    return id;
  };

  const transfer = (
    from: AccountKey,
    to: AccountKey,
    date: CalendarDate,
    amountCents: number,
    kind: TxnKind,
    description: string,
  ) => {
    const pair = nextId("pair");
    cash({
      account: from,
      date,
      amountCents: -amountCents,
      kind,
      description,
      transferPairId: pair,
    });
    cash({
      account: to,
      date,
      amountCents,
      kind,
      description,
      transferPairId: pair,
    });
  };

  // Prices --------------------------------------------------------------------------------------------------------------
  const priceBySymbol = new Map<AssetSymbol, Map<CalendarDate, Decimal>>();
  for (const [symbol, asset] of Object.entries(ASSETS) as [
    AssetSymbol,
    (typeof ASSETS)[AssetSymbol],
  ][]) {
    data.assets.push({
      id: SYNTHETIC_ASSET_IDS[symbol],
      symbol,
      name: asset.name,
      assetClass: asset.assetClass,
    });
    const series = new Map<CalendarDate, Decimal>();
    let price = toDecimal(asset.start);
    for (
      let date = addDays(startDate, -7);
      date <= endDate;
      date = addDays(date, 1)
    ) {
      const weekend = dayOfWeek(date) === 0 || dayOfWeek(date) === 6;
      if (asset.assetClass !== "CRYPTO" && weekend) {
        continue; // stock markets are closed
      }
      const change = (asset.drift + asset.vol * (2 * rng.next() - 1)).toFixed(
        6,
      );
      price = roundDecimal(price.times(toDecimal(change).plus(1)), 2);
      series.set(date, price);
      data.prices.push({
        assetId: SYNTHETIC_ASSET_IDS[symbol],
        date: db(date),
        close: price.toFixed(),
        source: SYNTHETIC_PRICE_SOURCE,
      });
    }
    priceBySymbol.set(symbol, series);
  }
  /** Last close on or before a date (markets are closed on weekends). */
  const priceOn = (symbol: AssetSymbol, date: CalendarDate): Decimal => {
    const series = priceBySymbol.get(symbol);
    for (
      let day = date, steps = 0;
      steps < 10;
      day = addDays(day, -1), steps += 1
    ) {
      const price = series?.get(day);
      if (price) {
        return price;
      }
    }
    throw new RangeError(`No synthetic price for ${symbol}`);
  };

  // Investment ledger ---------------------------------------------------------------------------------------------------
  interface Position {
    quantity: Decimal;
    costCents: number;
  }
  const portfolios = new Map<
    InvestmentAccountKey,
    { cashCents: number; positions: Map<AssetSymbol, Position> }
  >(
    (["brokerage", "roth", "crypto"] as const).map((key) => [
      key,
      { cashCents: 0, positions: new Map() },
    ]),
  );
  const portfolio = (key: InvestmentAccountKey) => {
    const value = portfolios.get(key);
    if (!value) {
      throw new RangeError("Unknown portfolio");
    }
    return value;
  };
  const position = (
    key: InvestmentAccountKey,
    symbol: AssetSymbol,
  ): Position => {
    const positions = portfolio(key).positions;
    let current = positions.get(symbol);
    if (!current) {
      current = { quantity: new Decimal(0), costCents: 0 };
      positions.set(symbol, current);
    }
    return current;
  };

  const investment = (
    account: InvestmentAccountKey,
    date: CalendarDate,
    fields: Omit<
      Prisma.InvestmentTransactionCreateManyInput,
      "id" | "userId" | "accountId" | "tradeDate" | "fingerprint"
    >,
  ) => {
    data.investmentTransactions.push({
      id: nextId("inv"),
      userId,
      accountId: accountId(account),
      tradeDate: db(date),
      fingerprint: fingerprint([
        account,
        date,
        fields.type,
        String(fields.quantity ?? ""),
        fields.cashAmountCents ?? 0,
      ]),
      ...fields,
    });
    portfolio(account).cashCents += fields.cashAmountCents ?? 0;
  };

  const buy = (
    account: InvestmentAccountKey,
    date: CalendarDate,
    symbol: AssetSymbol,
    budgetCents: number,
    feeRate?: string,
  ) => {
    const price = priceOn(symbol, date);
    const feeCents = feeRate ? multiplyCents(budgetCents, feeRate, "ceil") : 0;
    const quantity = roundDecimal(
      toDecimal(budgetCents - feeCents)
        .dividedBy(100)
        .dividedBy(price),
      ASSETS[symbol].decimals,
      "floor",
    );
    if (!quantity.greaterThan(0)) {
      return;
    }
    const costCents = marketValueCents(quantity, price);
    // cashAmountCents is the total cash effect, fee included; feeCents breaks the fee out.
    investment(account, date, {
      type: "BUY",
      assetId: SYNTHETIC_ASSET_IDS[symbol],
      quantity: quantity.toFixed(),
      unitPrice: price.toFixed(),
      cashAmountCents: -(costCents + feeCents),
      feeCents,
    });
    const held = position(account, symbol);
    held.quantity = held.quantity.plus(quantity);
    held.costCents += costCents + feeCents;
  };

  // Income ----------------------------------------------------------------------------------------------------------
  const firstFriday = (() => {
    let date = startDate;
    while (dayOfWeek(date) !== 5) {
      date = addDays(date, 1);
    }
    return date;
  })();
  const paySchedule: Schedule = {
    frequency: "biweekly",
    anchorDate: firstFriday,
  };
  const incomeSourceId = nextId("income");
  data.incomeSources.push({
    id: incomeSourceId,
    userId,
    name: "Primary job",
    type: "HOURLY",
    schedule: paySchedule as unknown as Prisma.InputJsonValue,
    depositAccountId: accountId("checking"),
    matchPattern: MERCHANTS.employer.name.toUpperCase(),
    hourlyRateCents: 2_600,
    typicalWeeklyHours: "40",
    takeHomeRatio: "0.79",
  });
  const paychecks: DatedAmount[] = occurrencesBetween(
    paySchedule,
    startDate,
    endDate,
  ).map((date) => ({
    date,
    // base take-home plus variable commission
    amountCents: 165_000 + (rng.chance(0.3) ? 0 : rng.int(50, 450) * 100),
  }));
  const paycheckByDate = new Map(
    paychecks.map((paycheck) => [paycheck.date, paycheck.amountCents]),
  );

  // Recurring bills ------------------------------------------------------------------------------------------------------
  interface Bill {
    key: MerchantKey;
    account: AccountKey;
    day: number;
    amount: () => number;
    tolerance: number;
  }
  const bills: Bill[] = [
    {
      key: "apartments",
      account: "checking",
      day: 1,
      amount: () => 115_000,
      tolerance: 0,
    },
    {
      key: "utility",
      account: "checking",
      day: 12,
      amount: () => rng.int(90, 145) * 100,
      tolerance: 3_000,
    },
    {
      key: "phone",
      account: "card",
      day: 18,
      amount: () => 6_500,
      tolerance: 500,
    },
    {
      key: "streamflix",
      account: "card",
      day: 5,
      amount: () => 1_549,
      tolerance: 0,
    },
    {
      key: "tunebox",
      account: "card",
      day: 9,
      amount: () => 1_099,
      tolerance: 0,
    },
    {
      key: "cloudvault",
      account: "card",
      day: 21,
      amount: () => 299,
      tolerance: 0,
    },
  ];
  const billSeries = bills.map((bill) => {
    const schedule: Schedule = { frequency: "monthly", dayOfMonth: bill.day };
    const id = nextId("recurring");
    const expected = bill.amount();
    data.recurringSeries.push({
      id,
      userId,
      name: MERCHANTS[bill.key].name,
      merchantId: merchantId(bill.key),
      accountId: accountId(bill.account),
      categoryId: categoryId(MERCHANTS[bill.key].category),
      kind: "EXPENSE",
      expectedAmountCents: -expected,
      toleranceCents: bill.tolerance,
      schedule: schedule as unknown as Prisma.InputJsonValue,
      nextExpectedDate: db(nextOccurrence(schedule, addDays(endDate, 1))),
      status: "ACTIVE",
    });
    return {
      ...bill,
      id,
      dates: new Set(occurrencesBetween(schedule, startDate, endDate)),
    };
  });

  // Contribution plans ---------------------------------------------------------------------------------------------------
  const weeklySchedule: Schedule = {
    frequency: "weekly",
    anchorDate: firstFriday,
  };
  const weeklyPlanId = nextId("plan");
  data.contributionPlans.push({
    id: weeklyPlanId,
    userId,
    name: "Weekly investing",
    sourceAccountId: accountId("checking"),
    ruleType: "PERCENT_OF_INCOME",
    percent: "0.15",
    schedule: weeklySchedule as unknown as Prisma.InputJsonValue,
    effectiveFrom: db(startDate),
  });
  const weeklyAllocations = [
    { accountId: accountId("brokerage"), share: "0.7" },
    { accountId: accountId("crypto"), share: "0.3" },
  ];
  for (const allocation of weeklyAllocations) {
    data.contributionAllocations.push({
      id: nextId("allocation"),
      userId,
      planId: weeklyPlanId,
      targetAccountId: allocation.accountId,
      share: allocation.share,
    });
  }
  const fridays = occurrencesBetween(weeklySchedule, startDate, endDate);
  const skippedDate = fridays[Math.min(30, fridays.length - 1)];
  const missedDate = fridays[Math.min(46, fridays.length - 1)]; // planned but never transferred: a visible shortfall
  if (skippedDate) {
    data.contributionOverrides.push({
      id: nextId("override"),
      userId,
      planId: weeklyPlanId,
      scheduledDate: db(skippedDate),
      skip: true,
      note: "Holiday week",
    });
  }
  const weeklyPlan = planContributions({
    rule: { type: "percentOfIncome", percent: "0.15" },
    schedule: weeklySchedule,
    incomes: paychecks,
    from: startDate,
    to: endDate,
    overrides: skippedDate ? [{ date: skippedDate, skip: true }] : [],
  });
  const weeklyTargetByDate = new Map(
    weeklyPlan.map((entry) => [entry.date, entry.targetCents]),
  );

  const rothSchedule: Schedule = { frequency: "monthly", dayOfMonth: 3 };
  const rothPlanId = nextId("plan");
  data.contributionPlans.push({
    id: rothPlanId,
    userId,
    name: "Roth IRA monthly",
    sourceAccountId: accountId("checking"),
    ruleType: "FIXED_AMOUNT",
    fixedAmountCents: 20_000,
    schedule: rothSchedule as unknown as Prisma.InputJsonValue,
    effectiveFrom: db(startDate),
  });
  data.contributionAllocations.push({
    id: nextId("allocation"),
    userId,
    planId: rothPlanId,
    targetAccountId: accountId("roth"),
    share: "1",
  });
  const rothDates = new Set(
    planContributions({
      rule: { type: "fixedAmount", amountCents: 20_000 },
      schedule: rothSchedule,
      from: startDate,
      to: endDate,
    }).map((entry) => entry.date),
  );

  const contribute = (
    planId: string,
    target: InvestmentAccountKey,
    date: CalendarDate,
    amountCents: number,
    taxYear?: number,
  ) => {
    const pair = nextId("pair");
    const cashLeg = cash({
      account: "checking",
      date,
      amountCents: -amountCents,
      kind: "INVESTMENT_CONTRIBUTION",
      description: `TRANSFER TO ${ACCOUNTS[target].name.toUpperCase()}`,
      transferPairId: pair,
      contributionPlanId: planId,
    });
    investment(target, date, {
      type: "DEPOSIT",
      cashAmountCents: amountCents,
      linkedCashTransactionId: cashLeg,
      contributionTaxYear: taxYear ?? null,
    });
  };

  // Goals ---------------------------------------------------------------------------------------------------------------
  const emergencyGoalId = nextId("goal");
  const vacationGoalId = nextId("goal");
  data.savingsGoals.push(
    {
      id: emergencyGoalId,
      userId,
      name: "Emergency fund",
      targetCents: 1_000_000,
      linkedAccountId: accountId("savings"),
      monthlyTargetCents: 15_000,
      priority: 1,
    },
    {
      id: vacationGoalId,
      userId,
      name: "Vacation",
      targetCents: 200_000,
      targetDate: db(
        lastDayOfMonth(addMonthsToYearMonth(yearMonthOf(endDate), 6)),
      ),
      linkedAccountId: accountId("savings"),
      monthlyTargetCents: 5_000,
      priority: 2,
    },
  );
  const goalEntry = (
    goalId: string,
    date: CalendarDate,
    amountCents: number,
    type: "ALLOCATE" | "WITHDRAW",
  ) =>
    data.goalLedgerEntries.push({
      id: nextId("goal-entry"),
      userId,
      goalId,
      accountId: accountId("savings"),
      date: db(date),
      amountCents,
      type,
    });

  // Discretionary spending schedule ------------------------------------------------------------------------------------
  const refunds = new Map<
    CalendarDate,
    { merchant: MerchantKey; amountCents: number }[]
  >();
  let nextGrocery = addDays(startDate, rng.int(0, 4));
  let nextGas = addDays(startDate, rng.int(0, 6));
  const carDates = new Set(
    Array.from({ length: 4 }, () =>
      addDays(startDate, rng.int(20, Math.max(21, months * 30 - 10))),
    ),
  );
  const swapMonth = months_[Math.min(9, months_.length - 1)];
  const vacationMonth = months_[Math.min(11, months_.length - 1)];

  const purchase = (
    date: CalendarDate,
    merchant: MerchantKey,
    amountCents: number,
  ) =>
    cash({
      account: "card",
      date,
      amountCents: -amountCents,
      kind: "EXPENSE",
      merchant,
      description: "",
      category: MERCHANTS[merchant].category,
    });

  const snapshotDates = new Set(
    months_
      .map((month) => lastDayOfMonth(month))
      .filter((date) => date <= endDate),
  );
  snapshotDates.add(endDate);

  // Day-by-day simulation --------------------------------------------------------------------------------------------------
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const { day } = dateParts(date);
    const month = yearMonthOf(date);

    const paycheck = paycheckByDate.get(date);
    if (paycheck !== undefined) {
      cash({
        account: "checking",
        date,
        amountCents: paycheck,
        kind: "INCOME",
        merchant: "employer",
        description: "",
        category: "paycheck",
        incomeSourceId,
      });
    }

    for (const bill of billSeries) {
      if (bill.dates.has(date)) {
        cash({
          account: bill.account,
          date,
          amountCents: -bill.amount(),
          kind: "EXPENSE",
          merchant: bill.key,
          description: "",
          category: MERCHANTS[bill.key].category,
          recurringSeriesId: bill.id,
        });
      }
    }

    if (date >= nextGrocery) {
      purchase(
        date,
        rng.pick(["freshMarket", "valleyGrocers"] as const),
        rng.int(45, 140) * 100 + rng.int(0, 99),
      );
      nextGrocery = addDays(date, rng.int(5, 8));
    }
    if (date >= nextGas) {
      purchase(date, "fuelStop", rng.int(32, 56) * 100 + rng.int(0, 99));
      nextGas = addDays(date, rng.int(9, 14));
    }
    if (rng.chance(4 / 30)) {
      purchase(
        date,
        rng.pick(["cornerBistro", "tacoStand", "noodleHouse"] as const),
        rng.int(12, 55) * 100 + rng.int(0, 99),
      );
    }
    if (rng.chance(2 / 30)) {
      const merchant = rng.pick(["everydayGoods", "onlineMart"] as const);
      const amount = rng.int(15, 120) * 100 + rng.int(0, 99);
      purchase(date, merchant, amount);
      if (rng.chance(0.15)) {
        const refundDate = addDays(date, rng.int(5, 20));
        const list = refunds.get(refundDate) ?? [];
        list.push({
          merchant,
          amountCents: multiplyCents(
            amount,
            rng.pick(["0.25", "0.5", "1"] as const),
          ),
        });
        refunds.set(refundDate, list);
      }
    }
    if (rng.chance(1 / 30)) {
      // A mixed shopping trip, split between groceries and household goods.
      const amount = rng.int(60, 150) * 100;
      const [groceries, shopping] = allocateCents(-amount, [2, 3]);
      cash({
        account: "card",
        date,
        amountCents: -amount,
        kind: "EXPENSE",
        merchant: "everydayGoods",
        description: "",
        splits: [
          { category: "groceries", amountCents: groceries ?? 0 },
          { category: "shopping", amountCents: shopping ?? 0 },
        ],
      });
    }
    if (rng.chance(2 / 30)) {
      purchase(
        date,
        rng.pick(["cinemaPlus", "gameShop"] as const),
        rng.int(10, 60) * 100 + rng.int(0, 99),
      );
    }
    if (rng.chance(1 / 30)) {
      purchase(date, "pharmacyOne", rng.int(15, 90) * 100 + rng.int(0, 99));
    }
    if (carDates.has(date)) {
      purchase(date, "quickLube", rng.int(80, 420) * 100);
    }
    for (const refund of refunds.get(date) ?? []) {
      cash({
        account: "card",
        date,
        amountCents: refund.amountCents,
        kind: "REFUND",
        merchant: refund.merchant,
        description: "",
        category: MERCHANTS[refund.merchant].category,
      });
    }

    if (day === 2) {
      transfer(
        "checking",
        "savings",
        date,
        20_000,
        "TRANSFER",
        "TRANSFER TO SAVINGS",
      );
      goalEntry(emergencyGoalId, date, 15_000, "ALLOCATE");
      goalEntry(vacationGoalId, date, 5_000, "ALLOCATE");
    }
    if (month === vacationMonth && day === 20) {
      transfer(
        "savings",
        "checking",
        date,
        50_000,
        "TRANSFER",
        "TRANSFER FROM SAVINGS",
      );
      goalEntry(vacationGoalId, date, -50_000, "WITHDRAW");
    }

    const weeklyTarget = weeklyTargetByDate.get(date);
    if (weeklyTarget && date !== missedDate) {
      for (const part of splitContribution(weeklyTarget, weeklyAllocations)) {
        const target: InvestmentAccountKey =
          part.accountId === accountId("brokerage") ? "brokerage" : "crypto";
        contribute(weeklyPlanId, target, date, part.amountCents);
        if (target === "brokerage") {
          buy(
            "brokerage",
            date,
            rng.pick(["VTI", "VTI", "VXUS", "MSFT"] as const),
            portfolio("brokerage").cashCents,
          );
        } else {
          const [btc, eth] = allocateCents(portfolio("crypto").cashCents, [
            "0.7",
            "0.3",
          ]);
          buy("crypto", date, "BTC", btc ?? 0, "0.004");
          buy("crypto", date, "ETH", eth ?? 0, "0.004");
        }
      }
    }
    if (rothDates.has(date)) {
      contribute(rothPlanId, "roth", date, 20_000, dateParts(date).year);
      buy("roth", date, "VTI", portfolio("roth").cashCents);
    }

    // Quarterly dividends on the total market ETF, kept as cash.
    if (day === 26 && [3, 6, 9, 12].includes(dateParts(date).month)) {
      for (const account of ["brokerage", "roth"] as const) {
        const held = portfolio(account).positions.get("VTI");
        if (held && held.quantity.greaterThan(0)) {
          investment(account, date, {
            type: "DIVIDEND",
            assetId: SYNTHETIC_ASSET_IDS.VTI,
            cashAmountCents: marketValueCents(held.quantity, "0.95"),
          });
        }
      }
    }
    // Monthly staking rewards on ether: no cash leg, so the fair value is recorded for cost basis.
    if (day === 15) {
      const held = portfolio("crypto").positions.get("ETH");
      const reward = held
        ? roundDecimal(held.quantity.times("0.0025"), 8, "floor")
        : new Decimal(0);
      if (held && reward.greaterThan(0)) {
        const valueCents = marketValueCents(reward, priceOn("ETH", date));
        investment("crypto", date, {
          type: "STAKING_REWARD",
          assetId: SYNTHETIC_ASSET_IDS.ETH,
          quantity: reward.toFixed(),
          cashAmountCents: 0,
          usdValueCents: valueCents,
          usdValueSource: "PRICE_HISTORY",
        });
        held.quantity = held.quantity.plus(reward);
        held.costCents += valueCents;
      }
    }
    // One crypto-to-crypto swap: both legs carry their USD value and share a groupRef.
    if (month === swapMonth && day === 10) {
      const btc = portfolio("crypto").positions.get("BTC");
      if (btc && btc.quantity.greaterThan(0)) {
        const sold = roundDecimal(btc.quantity.times("0.1"), 8, "floor");
        const soldValue = marketValueCents(sold, priceOn("BTC", date));
        const ethPrice = priceOn("ETH", date);
        const received = roundDecimal(
          toDecimal(soldValue).dividedBy(100).dividedBy(ethPrice),
          8,
          "floor",
        );
        const receivedValue = marketValueCents(received, ethPrice);
        const groupRef = nextId("swap");
        investment("crypto", date, {
          type: "SELL",
          assetId: SYNTHETIC_ASSET_IDS.BTC,
          quantity: sold.toFixed(),
          cashAmountCents: 0,
          usdValueCents: soldValue,
          usdValueSource: "PRICE_HISTORY",
          groupRef,
        });
        investment("crypto", date, {
          type: "BUY",
          assetId: SYNTHETIC_ASSET_IDS.ETH,
          quantity: received.toFixed(),
          unitPrice: ethPrice.toFixed(),
          cashAmountCents: 0,
          usdValueCents: receivedValue,
          usdValueSource: "PRICE_HISTORY",
          groupRef,
        });
        const removedCost = multiplyCents(
          btc.costCents,
          sold.dividedBy(btc.quantity),
        );
        btc.quantity = btc.quantity.minus(sold);
        btc.costCents -= removedCost;
        const eth = position("crypto", "ETH");
        eth.quantity = eth.quantity.plus(received);
        eth.costCents += receivedValue;
      }
    }

    // Pay the card in full on the 25th.
    const cardBalance = balances.get("card") ?? 0;
    if (day === 25 && cardBalance < 0) {
      transfer(
        "checking",
        "card",
        date,
        -cardBalance,
        "CREDIT_CARD_PAYMENT",
        "CARD PAYMENT",
      );
    }
    // Savings interest on the last day of the month.
    if (date === lastDayOfMonth(month)) {
      const interest = percentOfCents(balances.get("savings") ?? 0, "0.0035");
      if (interest > 0) {
        cash({
          account: "savings",
          date,
          amountCents: interest,
          kind: "INCOME",
          description: "INTEREST PAYMENT",
          category: "interest",
        });
      }
    }

    if (snapshotDates.has(date)) {
      for (const key of ["checking", "savings", "card"] as const) {
        data.balanceSnapshots.push({
          id: nextId("balance"),
          userId,
          accountId: accountId(key),
          asOfDate: db(date),
          balanceCents: balances.get(key) ?? 0,
          source: "COMPUTED",
        });
      }
      let investmentsCents = 0;
      for (const account of ["brokerage", "roth", "crypto"] as const) {
        let marketCents = 0;
        for (const [symbol, held] of portfolio(account).positions) {
          if (!held.quantity.greaterThan(0)) {
            continue;
          }
          const price = priceOn(symbol, date);
          const value = marketValueCents(held.quantity, price);
          marketCents += value;
          data.holdingSnapshots.push({
            id: nextId("holding"),
            userId,
            accountId: accountId(account),
            assetId: SYNTHETIC_ASSET_IDS[symbol],
            asOfDate: db(date),
            quantity: held.quantity.toFixed(),
            costBasisCents: held.costCents,
            priceUsed: price.toFixed(),
            marketValueCents: value,
            source: "COMPUTED",
          });
        }
        const cashCents = portfolio(account).cashCents;
        data.portfolioValuations.push({
          id: nextId("valuation"),
          userId,
          accountId: accountId(account),
          asOfDate: db(date),
          marketValueCents: marketCents,
          cashCents,
          source: "COMPUTED",
        });
        investmentsCents += marketCents + cashCents;
      }
      const checking = balances.get("checking") ?? 0;
      const savings = balances.get("savings") ?? 0;
      const card = balances.get("card") ?? 0;
      data.netWorthSnapshots.push({
        userId,
        asOfDate: db(date),
        assetsCents: checking + savings + investmentsCents + Math.max(card, 0),
        liabilitiesCents: Math.min(card, 0),
        cashCents: checking + savings,
        investmentsCents,
        otherAssetsCents: 0,
        completeness: {},
      });
    }
  }

  // Budgets and scenarios ---------------------------------------------------------------------------------------------
  months_.forEach((month, index) => {
    for (const [key, amount] of Object.entries(BUDGETS_CENTS)) {
      if (amount === undefined) {
        continue;
      }
      data.budgets.push({
        id: nextId("budget"),
        userId,
        month: db(firstDayOfMonth(month)),
        categoryId: categoryId(key),
        // Restaurants budget tightened partway through the history.
        amountCents: key === "restaurants" && index >= 9 ? 12_000 : amount,
      });
    }
  });
  data.forecastScenarios.push(
    {
      id: nextId("scenario"),
      userId,
      name: "Current habits",
      baseline: "HISTORICAL",
    },
    {
      id: nextId("scenario"),
      userId,
      name: "Follow my budget",
      baseline: "BUDGET",
    },
    {
      id: nextId("scenario"),
      userId,
      name: "Invest more",
      baseline: "HISTORICAL",
      contributionPercentOverride: "0.2",
    },
  );

  return data;
}
