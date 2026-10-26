/**
 * Validation for the account and balance forms. Inputs arrive as strings (FormData); outputs are typed values in
 * cents and calendar dates, or per-field messages. Pure, so the same rules are unit-tested without a server.
 */
import { z } from "zod";

import {
  ACCOUNT_TYPES,
  EARLIEST_BALANCE_DATE,
  INVESTMENT_ACCOUNT_TYPES,
  isLiabilityType,
  latestAllowedBalanceDate,
  splitValuation,
  storedBalanceFromEntry,
  supportsSafeToSpend,
  type AccountType,
  type InvestmentAccountType,
} from "./accounts";
import { compareDates, isCalendarDate, type CalendarDate } from "./dates";
import { parseUsdToCents } from "./money";

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type FormResult<Data, Field extends string> =
  { ok: true; data: Data } | { ok: false; fieldErrors: FieldErrors<Field> };

type FormSource = FormData | Record<string, string | undefined>;

function read(source: FormSource, field: string): string {
  const value = source instanceof FormData ? source.get(field) : source[field];
  return typeof value === "string" ? value.trim() : "";
}

const MAX_NAME_LENGTH = 80;

/** Parses a money field; returns a message instead of throwing (and never echoes the input). */
function cents(text: string): number | string {
  try {
    return parseUsdToCents(text);
  } catch {
    return "Enter an amount like 1,234.56";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Account details

export interface AccountInput {
  name: string;
  type: AccountType;
  investmentType: InvestmentAccountType | null;
  institutionName: string | null;
  mask: string | null;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  minimumBalanceCents: number | null;
}

export type AccountField =
  | "name"
  | "type"
  | "investmentType"
  | "institutionName"
  | "mask"
  | "minimumBalance";

const accountSchema = z.object({
  name: z
    .string()
    .min(1, "Give the account a name")
    .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters`),
  type: z.enum(ACCOUNT_TYPES, { error: "Choose an account type" }),
  investmentType: z.string(),
  institutionName: z
    .string()
    .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters`),
  mask: z
    .string()
    .regex(/^(\d{2,4})?$/, "Enter only the last 2 to 4 digits, or leave empty"),
  includeInNetWorth: z.boolean(),
  includeInSafeToSpend: z.boolean(),
  minimumBalance: z.string(),
});

export function parseAccountForm(
  source: FormSource,
): FormResult<AccountInput, AccountField> {
  const parsed = accountSchema.safeParse({
    name: read(source, "name"),
    type: read(source, "type"),
    investmentType: read(source, "investmentType"),
    institutionName: read(source, "institutionName"),
    mask: read(source, "mask"),
    includeInNetWorth: read(source, "includeInNetWorth") === "on",
    includeInSafeToSpend: read(source, "includeInSafeToSpend") === "on",
    minimumBalance: read(source, "minimumBalance"),
  });
  const fieldErrors: FieldErrors<AccountField> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as AccountField;
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const values = parsed.data;

  let investmentType: InvestmentAccountType | null = null;
  if (values.type === "INVESTMENT") {
    if (
      INVESTMENT_ACCOUNT_TYPES.includes(
        values.investmentType as InvestmentAccountType,
      )
    ) {
      investmentType = values.investmentType as InvestmentAccountType;
    } else {
      fieldErrors.investmentType = "Choose the kind of investment account";
    }
  }

  // Safe to Spend settings only apply to spendable accounts; anything sent for other types is dropped.
  const spendable = supportsSafeToSpend(values.type);
  let minimumBalanceCents: number | null = null;
  if (spendable && values.minimumBalance !== "") {
    const parsedCents = cents(values.minimumBalance);
    if (typeof parsedCents === "string") {
      fieldErrors.minimumBalance = parsedCents;
    } else if (parsedCents < 0) {
      fieldErrors.minimumBalance = "The minimum balance cannot be negative";
    } else {
      minimumBalanceCents = parsedCents;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    data: {
      name: values.name,
      type: values.type,
      investmentType,
      institutionName: values.institutionName || null,
      mask: values.mask || null,
      includeInNetWorth: values.includeInNetWorth,
      includeInSafeToSpend: spendable && values.includeInSafeToSpend,
      minimumBalanceCents,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Balance updates

export type BalanceInput =
  | {
      storage: "snapshot";
      asOfDate: CalendarDate;
      balanceCents: number;
      availableCents: number | null;
    }
  | {
      storage: "valuation";
      asOfDate: CalendarDate;
      marketValueCents: number;
      cashCents: number;
    };

export type BalanceField = "asOfDate" | "amount" | "available" | "cash";

function parseAsOfDate(text: string, now: Date): CalendarDate | string {
  if (!isCalendarDate(text)) {
    return "Enter a date";
  }
  if (compareDates(text, EARLIEST_BALANCE_DATE) < 0) {
    return "Enter a date in 1970 or later";
  }
  if (compareDates(text, latestAllowedBalanceDate(now)) > 0) {
    return "The date cannot be in the future";
  }
  return text;
}

/**
 * Bank, card, loan and other accounts: a signed balance (liabilities are entered as the amount owed). Investment
 * accounts: the total value, of which an optional part is uninvested cash.
 */
export function parseBalanceForm(
  type: AccountType,
  source: FormSource,
  now: Date = new Date(),
): FormResult<BalanceInput, BalanceField> {
  const fieldErrors: FieldErrors<BalanceField> = {};
  const asOfDate = parseAsOfDate(read(source, "asOfDate"), now);
  if (!isCalendarDate(asOfDate)) {
    fieldErrors.asOfDate = asOfDate;
  }

  const amountText = read(source, "amount");
  const amount = amountText === "" ? "Enter an amount" : cents(amountText);
  if (typeof amount === "string") {
    fieldErrors.amount = amount;
  }

  if (type === "INVESTMENT") {
    const cashText = read(source, "cash");
    const cash = cashText === "" ? 0 : cents(cashText);
    if (typeof cash === "string") {
      fieldErrors.cash = cash;
    }
    if (typeof amount === "number" && amount < 0) {
      fieldErrors.amount = "An account value cannot be negative";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, fieldErrors };
    }
    const total = amount as number;
    const cashCents = cash as number;
    if (cashCents < 0 || cashCents > total) {
      return {
        ok: false,
        fieldErrors: { cash: "Cash must be between zero and the total value" },
      };
    }
    return {
      ok: true,
      data: {
        storage: "valuation",
        asOfDate: asOfDate as CalendarDate,
        ...splitValuation(total, cashCents),
      },
    };
  }

  let availableCents: number | null = null;
  const availableText = read(source, "available");
  if (supportsSafeToSpend(type) && availableText !== "") {
    const available = cents(availableText);
    if (typeof available === "string") {
      fieldErrors.available = available;
    } else {
      availableCents = available;
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    data: {
      storage: "snapshot",
      asOfDate: asOfDate as CalendarDate,
      balanceCents: storedBalanceFromEntry(type, amount as number),
      availableCents,
    },
  };
}

/** The label the balance form uses for its main amount. */
export function balanceAmountLabel(type: AccountType): string {
  if (type === "INVESTMENT") {
    return "Total account value";
  }
  return isLiabilityType(type) ? "Amount owed" : "Balance";
}
