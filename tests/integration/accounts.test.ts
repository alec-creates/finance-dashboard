import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AccountInput } from "../../src/lib/account-forms";
import { parseBalanceForm } from "../../src/lib/account-forms";
import { parseCalendarDate, toDatabaseDate } from "../../src/lib/dates";
import {
  createAccount,
  deleteAccount,
  deleteManualBalance,
  getAccountDetail,
  getAccountType,
  listAccounts,
  listAccountsWithBalances,
  recordBalance,
  setAccountArchived,
  updateAccount,
} from "../../src/server/services/accounts";

import {
  createTestPrisma,
  createTransaction,
  createUser,
  expectRejected,
  resetDatabase,
} from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-26T12:00:00Z");

/** Invented account details for tests. */
function input(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    name: "Everyday checking",
    type: "CHECKING",
    investmentType: null,
    institutionName: "Example Bank",
    mask: "0042",
    includeInNetWorth: true,
    includeInSafeToSpend: true,
    minimumBalanceCents: 50_000,
    ...overrides,
  };
}

async function create(userId: string, overrides: Partial<AccountInput> = {}) {
  const result = await createAccount(prisma, userId, input(overrides));
  if (!result.ok) {
    throw new Error("create failed");
  }
  return result.value.id;
}

/** Records a balance through the same parsing the form uses. */
async function record(
  userId: string,
  accountId: string,
  type: AccountInput["type"],
  fields: Record<string, string>,
) {
  const parsed = parseBalanceForm(type, fields, NOW);
  if (!parsed.ok) {
    throw new Error(`invalid balance: ${JSON.stringify(parsed.fieldErrors)}`);
  }
  return recordBalance(prisma, userId, accountId, parsed.data);
}

async function snapshotCount(accountId: string) {
  return prisma.balanceSnapshot.count({ where: { accountId } });
}

let alice: { id: string };
let bob: { id: string };

beforeEach(async () => {
  await resetDatabase(prisma);
  alice = await createUser(prisma, "alice");
  bob = await createUser(prisma, "bob");
});

describe("creating and listing accounts", () => {
  it("lists only the owner's accounts, with no balance until one is recorded", async () => {
    const aliceChecking = await create(alice.id);
    await create(bob.id, { name: "Bob's checking" });

    const accounts = await listAccountsWithBalances(prisma, alice.id);
    expect(accounts.map((account) => account.id)).toEqual([aliceChecking]);
    expect(accounts[0]).toMatchObject({
      name: "Everyday checking",
      includeInSafeToSpend: true,
      minimumBalanceCents: 50_000,
      current: null,
      archivedAt: null,
    });
  });

  it("supports every account type, with investments typed", async () => {
    await create(alice.id, {
      type: "CREDIT_CARD",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await create(alice.id, {
      type: "INVESTMENT",
      investmentType: "ROTH_IRA",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await create(alice.id, {
      type: "LOAN",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    const types = (await listAccounts(prisma, alice.id)).map(
      ({ type, investmentType }) => [type, investmentType],
    );
    expect(types).toEqual(
      expect.arrayContaining([
        ["CREDIT_CARD", null],
        ["INVESTMENT", "ROTH_IRA"],
        ["LOAN", null],
      ]),
    );
  });

  it("is backed by database rules for Safe to Spend and minimum balances", async () => {
    // The form drops these; the database refuses them even if a code path didn't.
    await expectRejected(
      create(alice.id, { type: "CREDIT_CARD", includeInSafeToSpend: true }),
      /safe_to_spend_cash_only|23514/i,
    );
    await expectRejected(
      create(alice.id, { minimumBalanceCents: -1 }),
      /minimum_balance|23514/i,
    );
    await expectRejected(
      create(alice.id, { type: "INVESTMENT", investmentType: null }),
      /investment_type|23514/i,
    );
  });
});

describe("balances", () => {
  it("stores a card's amount owed as negative and reports it as the current balance", async () => {
    const card = await create(alice.id, {
      type: "CREDIT_CARD",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await record(alice.id, card, "CREDIT_CARD", {
      asOfDate: "2026-10-20",
      amount: "420.00",
    });
    const [account] = await listAccountsWithBalances(prisma, alice.id);
    expect(account?.current).toMatchObject({
      storage: "snapshot",
      balanceCents: -42_000,
      asOfDate: "2026-10-20",
      source: "MANUAL",
    });
  });

  it("uses the latest date, and on one date prefers a statement over a manual entry", async () => {
    const checking = await create(alice.id);
    await record(alice.id, checking, "CHECKING", {
      asOfDate: "2026-10-01",
      amount: "100",
    });
    await record(alice.id, checking, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "250",
      available: "200",
    });
    await prisma.balanceSnapshot.create({
      data: {
        userId: alice.id,
        accountId: checking,
        asOfDate: toDatabaseDate(parseCalendarDate("2026-10-15")),
        balanceCents: 24_000,
        source: "STATEMENT",
      },
    });

    const [listed] = await listAccountsWithBalances(prisma, alice.id);
    expect(listed?.current).toMatchObject({
      balanceCents: 24_000,
      source: "STATEMENT",
    });
    const detail = await getAccountDetail(prisma, alice.id, checking);
    expect(detail?.current).toEqual(listed?.current);
    expect(detail?.history.map((entry) => entry.amountCents)).toEqual(
      expect.arrayContaining([10_000, 25_000, 24_000]),
    );
    expect(detail?.historyTotal).toBe(3);
  });

  it("replaces a manual entry for the same date instead of adding a second", async () => {
    const checking = await create(alice.id);
    const first = await record(alice.id, checking, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    const second = await record(alice.id, checking, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "120",
    });
    expect(first).toEqual({ ok: true, value: { replaced: false } });
    expect(second).toEqual({ ok: true, value: { replaced: true } });
    expect(await snapshotCount(checking)).toBe(1);
    const [account] = await listAccountsWithBalances(prisma, alice.id);
    expect(account?.current).toMatchObject({ balanceCents: 12_000 });
  });

  it("keeps an investment account's cash inside its total, in valuations only", async () => {
    const brokerage = await create(alice.id, {
      type: "INVESTMENT",
      investmentType: "TAXABLE_BROKERAGE",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await record(alice.id, brokerage, "INVESTMENT", {
      asOfDate: "2026-10-20",
      amount: "10,250.50",
      cash: "250.50",
    });

    const [account] = await listAccountsWithBalances(prisma, alice.id);
    expect(account?.current).toEqual({
      storage: "valuation",
      asOfDate: "2026-10-20",
      source: "MANUAL",
      totalCents: 1_025_050,
      marketValueCents: 1_000_000,
      cashCents: 25_050,
    });
    expect(await snapshotCount(brokerage)).toBe(0);
  });

  it("refuses a balance shaped for the wrong kind of account", async () => {
    const brokerage = await create(alice.id, {
      type: "INVESTMENT",
      investmentType: "CRYPTO_EXCHANGE",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await expect(
      recordBalance(prisma, alice.id, brokerage, {
        storage: "snapshot",
        asOfDate: parseCalendarDate("2026-10-20"),
        balanceCents: 100,
        availableCents: null,
      }),
    ).rejects.toThrow(/does not match/);
  });

  it("removes manual entries only, never statement or synced history", async () => {
    const checking = await create(alice.id);
    await record(alice.id, checking, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    const statement = await prisma.balanceSnapshot.create({
      data: {
        userId: alice.id,
        accountId: checking,
        asOfDate: toDatabaseDate(parseCalendarDate("2026-10-01")),
        balanceCents: 9_000,
        source: "STATEMENT",
      },
    });
    const manual = await prisma.balanceSnapshot.findFirstOrThrow({
      where: { accountId: checking, source: "MANUAL" },
    });

    expect(
      await deleteManualBalance(prisma, alice.id, checking, statement.id),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await deleteManualBalance(prisma, alice.id, checking, manual.id),
    ).toEqual({ ok: true, value: undefined });
    expect(
      (
        await prisma.balanceSnapshot.findMany({
          where: { accountId: checking },
        })
      ).map((row) => row.source),
    ).toEqual(["STATEMENT"]);
  });
});

describe("editing", () => {
  it("allows any type change before history exists", async () => {
    const account = await create(alice.id);
    expect(
      await updateAccount(
        prisma,
        alice.id,
        account,
        input({
          type: "CREDIT_CARD",
          includeInSafeToSpend: false,
          minimumBalanceCents: null,
        }),
      ),
    ).toEqual({ ok: true, value: undefined });
  });

  it("after a balance is recorded, allows checking to savings but not checking to credit card", async () => {
    const account = await create(alice.id);
    await record(alice.id, account, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    expect(
      await updateAccount(
        prisma,
        alice.id,
        account,
        input({ type: "SAVINGS", name: "Renamed" }),
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await updateAccount(
        prisma,
        alice.id,
        account,
        input({
          type: "CREDIT_CARD",
          includeInSafeToSpend: false,
          minimumBalanceCents: null,
        }),
      ),
    ).toEqual({ ok: false, reason: "type-locked" });
    const stored = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account },
    });
    expect(stored).toMatchObject({ type: "SAVINGS", name: "Renamed" });
  });

  it("locks an investment account's kind once a value is recorded", async () => {
    const roth = await create(alice.id, {
      type: "INVESTMENT",
      investmentType: "ROTH_IRA",
      includeInSafeToSpend: false,
      minimumBalanceCents: null,
    });
    await record(alice.id, roth, "INVESTMENT", {
      asOfDate: "2026-10-15",
      amount: "5000",
    });
    expect(
      await updateAccount(
        prisma,
        alice.id,
        roth,
        input({
          type: "INVESTMENT",
          investmentType: "TAXABLE_BROKERAGE",
          includeInSafeToSpend: false,
          minimumBalanceCents: null,
        }),
      ),
    ).toEqual({ ok: false, reason: "type-locked" });
  });
});

describe("archiving and deleting", () => {
  it("archives without losing history, refuses changes while archived, and restores", async () => {
    const account = await create(alice.id);
    await record(alice.id, account, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    expect(await setAccountArchived(prisma, alice.id, account, true)).toEqual({
      ok: true,
      value: undefined,
    });

    const [archived] = await listAccountsWithBalances(prisma, alice.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(archived?.current).toMatchObject({ balanceCents: 10_000 });
    expect(await listAccounts(prisma, alice.id)).toEqual([]);
    expect(
      await record(alice.id, account, "CHECKING", {
        asOfDate: "2026-10-16",
        amount: "200",
      }),
    ).toEqual({ ok: false, reason: "archived" });
    expect(await updateAccount(prisma, alice.id, account, input())).toEqual({
      ok: false,
      reason: "archived",
    });

    await setAccountArchived(prisma, alice.id, account, false);
    expect((await listAccounts(prisma, alice.id)).length).toBe(1);
    expect(await snapshotCount(account)).toBe(1);
  });

  it("deletes an account with no history", async () => {
    const account = await create(alice.id);
    expect(await deleteAccount(prisma, alice.id, account)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await prisma.financialAccount.count()).toBe(0);
  });

  it("refuses to delete an account with balances or transactions", async () => {
    const withBalance = await create(alice.id);
    await record(alice.id, withBalance, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    const withTransaction = await create(alice.id, { name: "Second" });
    await createTransaction(prisma, {
      userId: alice.id,
      accountId: withTransaction,
      amountCents: -500,
    });

    for (const account of [withBalance, withTransaction]) {
      expect(await deleteAccount(prisma, alice.id, account)).toEqual({
        ok: false,
        reason: "has-history",
      });
    }
    expect(await prisma.financialAccount.count()).toBe(2);
    expect(await snapshotCount(withBalance)).toBe(1);
  });
});

describe("another user's account behaves as if it does not exist", () => {
  let aliceAccount: string;
  let aliceEntry: string;

  beforeEach(async () => {
    aliceAccount = await create(alice.id);
    await record(alice.id, aliceAccount, "CHECKING", {
      asOfDate: "2026-10-15",
      amount: "100",
    });
    aliceEntry = (
      await prisma.balanceSnapshot.findFirstOrThrow({
        where: { accountId: aliceAccount },
      })
    ).id;
  });

  it("cannot be read", async () => {
    expect(await getAccountDetail(prisma, bob.id, aliceAccount)).toBeNull();
    expect(await getAccountType(prisma, bob.id, aliceAccount)).toBeNull();
    expect(await listAccountsWithBalances(prisma, bob.id)).toEqual([]);
  });

  it("cannot be edited, archived or deleted", async () => {
    expect(
      await updateAccount(
        prisma,
        bob.id,
        aliceAccount,
        input({ name: "Taken over" }),
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await setAccountArchived(prisma, bob.id, aliceAccount, true),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await deleteAccount(prisma, bob.id, aliceAccount)).toEqual({
      ok: false,
      reason: "not-found",
    });

    const stored = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: aliceAccount },
    });
    expect(stored).toMatchObject({
      userId: alice.id,
      name: "Everyday checking",
      archivedAt: null,
    });
  });

  it("cannot receive balances or lose its history", async () => {
    expect(
      await record(bob.id, aliceAccount, "CHECKING", {
        asOfDate: "2026-10-16",
        amount: "999",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await deleteManualBalance(prisma, bob.id, aliceAccount, aliceEntry),
    ).toEqual({ ok: false, reason: "not-found" });

    // Bob's own account id paired with Alice's entry id does not reach it either.
    const bobAccount = await create(bob.id);
    expect(
      await deleteManualBalance(prisma, bob.id, bobAccount, aliceEntry),
    ).toEqual({ ok: false, reason: "not-found" });

    expect(await snapshotCount(aliceAccount)).toBe(1);
    expect(
      (
        await prisma.balanceSnapshot.findUniqueOrThrow({
          where: { id: aliceEntry },
        })
      ).balanceCents,
    ).toBe(10_000);
  });
});
