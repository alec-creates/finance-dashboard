/**
 * Validation for the manual transaction form. Amounts are entered as positive magnitudes; the kind (and, for
 * movements, the chosen direction) decides the sign. Splits are entered the same way and must add up exactly.
 */
import { z } from "zod";

import { latestAllowedBalanceDate } from "./accounts";
import { compareDates, isCalendarDate, type CalendarDate } from "./dates";
import type { FieldErrors, FormResult } from "./account-forms";
import { parseUsdToCents } from "./money";
import {
  KIND_RULES,
  MAX_SPLITS,
  signedAmountCents,
  splitProblem,
  TXN_KINDS,
  type TxnKind,
} from "./transactions";

export interface TransactionInput {
  accountId: string;
  date: CalendarDate;
  description: string;
  kind: TxnKind;
  /** Signed. */
  amountCents: number;
  notes: string | null;
  /** Signed like the transaction; sums exactly to amountCents. */
  splits: { categoryId: string | null; amountCents: number }[];
}

/** Per-row errors use `splitAmount.<index>`. */
export type TransactionField =
  | "accountId"
  | "date"
  | "description"
  | "kind"
  | "direction"
  | "amount"
  | "notes"
  | "splits"
  | `splitAmount.${number}`;

export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_NOTES_LENGTH = 1000;
const EARLIEST_DATE = "1970-01-01" as CalendarDate;

const baseSchema = z.object({
  accountId: z.string().min(1, "Choose an account"),
  date: z.string(),
  description: z
    .string()
    .min(1, "Describe the transaction")
    .max(
      MAX_DESCRIPTION_LENGTH,
      `Use at most ${MAX_DESCRIPTION_LENGTH} characters`,
    ),
  kind: z.enum(TXN_KINDS, { error: "Choose what kind of transaction this is" }),
  direction: z.string(),
  amount: z.string(),
  notes: z
    .string()
    .max(MAX_NOTES_LENGTH, `Use at most ${MAX_NOTES_LENGTH} characters`),
});

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function texts(form: FormData, field: string): string[] {
  return form
    .getAll(field)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

/** A positive amount in cents, or a message. Never echoes the input. */
function magnitude(textValue: string, empty: string): number | string {
  if (textValue === "") {
    return empty;
  }
  let cents: number;
  try {
    cents = parseUsdToCents(textValue);
  } catch {
    return "Enter an amount like 1,234.56";
  }
  return cents > 0 ? cents : "Enter an amount above zero, without a minus sign";
}

export function parseTransactionForm(
  form: FormData,
  now: Date = new Date(),
): FormResult<TransactionInput, TransactionField> {
  const fieldErrors: FieldErrors<TransactionField> = {};
  const parsed = baseSchema.safeParse({
    accountId: text(form, "accountId"),
    date: text(form, "date"),
    description: text(form, "description"),
    kind: text(form, "kind"),
    direction: text(form, "direction"),
    amount: text(form, "amount"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as TransactionField;
      fieldErrors[field] ??= issue.message;
    }
  }
  const values = parsed.success ? parsed.data : null;

  const date = text(form, "date");
  if (!isCalendarDate(date)) {
    fieldErrors.date = "Enter a date";
  } else if (compareDates(date, EARLIEST_DATE) < 0) {
    fieldErrors.date = "Enter a date in 1970 or later";
  } else if (compareDates(date, latestAllowedBalanceDate(now)) > 0) {
    fieldErrors.date = "The date cannot be in the future";
  }

  const total = magnitude(text(form, "amount"), "Enter an amount");
  if (typeof total === "string") {
    fieldErrors.amount = total;
  }

  const kind = values?.kind;
  const needsDirection = kind ? KIND_RULES[kind].direction === "either" : false;
  const direction = text(form, "direction");
  if (needsDirection && direction !== "in" && direction !== "out") {
    fieldErrors.direction = "Choose whether money went in or out";
  }

  // Splits: category ids and amounts arrive as parallel lists. One row with no amount means "the whole amount".
  const categoryIds = texts(form, "splitCategory");
  const splitTexts = texts(form, "splitAmount");
  const rows = Math.max(categoryIds.length, splitTexts.length, 1);
  if (rows > MAX_SPLITS) {
    fieldErrors.splits = `Use at most ${MAX_SPLITS} splits`;
  }
  const categorized = kind ? KIND_RULES[kind].categoryType !== null : true;
  if (kind && !categorized && (rows > 1 || categoryIds.some(Boolean))) {
    fieldErrors.splits = `${KIND_RULES[kind].label} transactions don't use categories or splits`;
  }

  let splitMagnitudes: number[] = [];
  if (typeof total === "number") {
    if (rows === 1 && (splitTexts[0] ?? "") === "") {
      splitMagnitudes = [total];
    } else {
      splitMagnitudes = Array.from({ length: rows }, (_, index) => {
        const result = magnitude(splitTexts[index] ?? "", "Enter an amount");
        if (typeof result === "string") {
          fieldErrors[`splitAmount.${index}`] = result;
          return 0;
        }
        return result;
      });
      const rowErrors = Object.keys(fieldErrors).some((key) =>
        key.startsWith("splitAmount."),
      );
      if (!rowErrors && !fieldErrors.splits) {
        const problem = splitProblem(total, splitMagnitudes);
        if (problem) {
          fieldErrors.splits = problem;
        }
      }
    }
  }

  if (
    Object.keys(fieldErrors).length > 0 ||
    !values ||
    typeof total !== "number"
  ) {
    return { ok: false, fieldErrors };
  }

  const sign = (cents: number) =>
    signedAmountCents(values.kind, cents, direction as "in" | "out");
  return {
    ok: true,
    data: {
      accountId: values.accountId,
      date: date as CalendarDate,
      description: values.description,
      kind: values.kind,
      amountCents: sign(total),
      notes: values.notes || null,
      splits: splitMagnitudes.map((cents, index) => ({
        categoryId: categorized ? categoryIds[index] || null : null,
        amountCents: sign(cents),
      })),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Categories

export interface CategoryInput {
  name: string;
  type: "EXPENSE" | "INCOME";
  parentId: string | null;
  isEssential: boolean;
}

export type CategoryField = "name" | "type" | "parentId";

const categorySchema = z.object({
  name: z
    .string()
    .min(1, "Give the category a name")
    .max(60, "Use at most 60 characters"),
  type: z.enum(["EXPENSE", "INCOME"], { error: "Choose spending or income" }),
  parentId: z.string(),
  isEssential: z.boolean(),
});

export function parseCategoryForm(
  form: FormData,
): FormResult<CategoryInput, CategoryField> {
  const parsed = categorySchema.safeParse({
    name: text(form, "name"),
    type: text(form, "type"),
    parentId: text(form, "parentId"),
    isEssential: text(form, "isEssential") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: FieldErrors<CategoryField> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as CategoryField;
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    data: {
      ...parsed.data,
      parentId: parsed.data.parentId || null,
    },
  };
}
