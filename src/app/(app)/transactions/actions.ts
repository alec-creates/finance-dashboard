"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formValues, type FormState } from "@/lib/form-state";
import {
  parseCategoryForm,
  parseTransactionForm,
  type CategoryField,
  type TransactionField,
} from "@/lib/transaction-forms";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import {
  createCategory,
  setCategoryArchived,
  updateCategory,
  type CategoryFailure,
} from "@/server/services/categories";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type TransactionFailure,
} from "@/server/services/transactions";

/*
 * Thin Server Actions for transactions and categories: authenticate, parse, call a service with the session's user
 * id, refresh. Ids from the client are only ever used together with that user id. Expected failures are values.
 */

/** Split rows are sent back separately because a form can submit several values per field. */
export interface TransactionValues {
  fields: Record<string, string>;
  splits: { category: string; amount: string }[];
}

export type TransactionFormState = FormState<
  TransactionField,
  TransactionValues
>;
export type CategoryFormState = FormState<CategoryField>;
export type SimpleActionState = FormState<never>;

const TRANSACTION_MESSAGES: Record<TransactionFailure, string> = {
  "not-found": "This transaction no longer exists.",
  imported:
    "Imported transactions keep their original details. Undo the import to remove them.",
  "account-not-found": "Choose one of your accounts.",
  "account-archived":
    "That account is archived. Restore it before adding or changing its transactions.",
  "category-not-found": "One of the chosen categories no longer exists.",
  "category-type":
    "Use spending categories for expenses and refunds, income categories for income, and none for transfers or payments.",
  "category-archived": "One of the chosen categories is archived.",
  "invalid-amount": "The amount or splits don't match the kind of transaction.",
};

const CATEGORY_MESSAGES: Record<CategoryFailure, string> = {
  "not-found": "This category no longer exists.",
  "duplicate-name": "A category with this name already exists there.",
  "invalid-parent": "Choose a top-level category as the parent.",
  "has-active-children": "Archive its subcategories first.",
  "parent-archived": "Restore its parent category first.",
};

function transactionValues(formData: FormData): TransactionValues {
  const categories = formData.getAll("splitCategory").map(String);
  const amounts = formData.getAll("splitAmount").map(String);
  return {
    fields: formValues(formData),
    splits: Array.from(
      { length: Math.max(categories.length, amounts.length) },
      (_, index) => ({
        category: categories[index] ?? "",
        amount: amounts[index] ?? "",
      }),
    ),
  };
}

function refreshApp(): void {
  revalidatePath("/", "layout");
}

async function saveTransaction(
  transactionId: string | null,
  formData: FormData,
): Promise<TransactionFormState> {
  const user = await requireUser();
  const parsed = parseTransactionForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      values: transactionValues(formData),
    };
  }
  const prisma = getPrisma();
  const result = transactionId
    ? await updateTransaction(prisma, user.id, transactionId, parsed.data)
    : await createTransaction(prisma, user.id, parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: TRANSACTION_MESSAGES[result.reason],
      values: transactionValues(formData),
    };
  }
  refreshApp();
  // Back to the month and account the transaction belongs to.
  const month = parsed.data.date.slice(0, 7);
  redirect(
    `/transactions?month=${month}&account=${encodeURIComponent(parsed.data.accountId)}`,
  );
}

export async function createTransactionAction(
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  return saveTransaction(null, formData);
}

export async function updateTransactionAction(
  transactionId: string,
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  return saveTransaction(transactionId, formData);
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<SimpleActionState> {
  const user = await requireUser();
  const result = await deleteTransaction(getPrisma(), user.id, transactionId);
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: TRANSACTION_MESSAGES[result.reason],
      values: {},
    };
  }
  refreshApp();
  redirect("/transactions");
}

// ---------------------------------------------------------------------------------------------------------------------
// Categories

export async function createCategoryAction(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireUser();
  const parsed = parseCategoryForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      values: formValues(formData),
    };
  }
  const result = await createCategory(getPrisma(), user.id, parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors:
        result.reason === "duplicate-name"
          ? { name: CATEGORY_MESSAGES["duplicate-name"] }
          : { parentId: CATEGORY_MESSAGES[result.reason] },
      values: formValues(formData),
    };
  }
  refreshApp();
  return { status: "saved", message: `Added ${parsed.data.name}.` };
}

export async function updateCategoryAction(
  categoryId: string,
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) {
    return {
      status: "error",
      fieldErrors: {
        name: name ? "Use at most 60 characters" : "Give the category a name",
      },
      values: formValues(formData),
    };
  }
  const result = await updateCategory(getPrisma(), user.id, categoryId, {
    name,
    isEssential: formData.get("isEssential") === "on",
  });
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors:
        result.reason === "duplicate-name"
          ? { name: CATEGORY_MESSAGES["duplicate-name"] }
          : {},
      formError:
        result.reason === "duplicate-name"
          ? undefined
          : CATEGORY_MESSAGES[result.reason],
      values: formValues(formData),
    };
  }
  refreshApp();
  return { status: "saved", message: "Saved." };
}

export async function setCategoryArchivedAction(
  categoryId: string,
  archived: boolean,
): Promise<SimpleActionState> {
  const user = await requireUser();
  const result = await setCategoryArchived(
    getPrisma(),
    user.id,
    categoryId,
    archived,
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: CATEGORY_MESSAGES[result.reason],
      values: {},
    };
  }
  refreshApp();
  return {
    status: "saved",
    message: archived ? "Category archived." : "Category restored.",
  };
}
