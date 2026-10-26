"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseAccountForm,
  parseBalanceForm,
  type AccountField,
  type BalanceField,
} from "@/lib/account-forms";
import { formValues, type FormState } from "@/lib/form-state";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import {
  createAccount,
  deleteAccount,
  deleteManualBalance,
  getAccountType,
  recordBalance,
  setAccountArchived,
  updateAccount,
  type AccountFailure,
} from "@/server/services/accounts";

/*
 * Thin Server Actions: authenticate, parse, call a service, refresh. They are reachable by direct POST, so each one
 * checks the session itself and passes the session's user id; an account id from the client is only ever looked up
 * together with that user id. Expected failures come back as values for the form to show.
 */

export type AccountFormState = FormState<AccountField>;
export type BalanceFormState =
  | FormState<BalanceField>
  | {
      /** A manual entry exists for the date: show it and ask before replacing. */
      status: "confirm-replace";
      existingCents: number;
      values: Record<string, string>;
    };
export type ActionState = FormState<never>;

const FAILURE_MESSAGES: Record<AccountFailure, string> = {
  "not-found": "This account no longer exists.",
  archived: "Restore this account before changing it.",
  "type-locked":
    "Once balances or transactions are recorded, the type can only change between checking, savings and cash.",
  "has-history":
    "This account has recorded history, so it can't be deleted. Archive it instead to keep the history.",
};

function refreshApp(): void {
  // Account names and balances appear across the app (overview, lists, detail pages).
  revalidatePath("/", "layout");
}

export async function createAccountAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser();
  const parsed = parseAccountForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      values: formValues(formData),
    };
  }
  const result = await createAccount(getPrisma(), user.id, parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: FAILURE_MESSAGES[result.reason],
      values: formValues(formData),
    };
  }
  refreshApp();
  redirect(`/accounts/${result.value.id}`);
}

export async function updateAccountAction(
  accountId: string,
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser();
  const parsed = parseAccountForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      values: formValues(formData),
    };
  }
  const result = await updateAccount(
    getPrisma(),
    user.id,
    accountId,
    parsed.data,
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors:
        result.reason === "type-locked"
          ? { type: FAILURE_MESSAGES["type-locked"] }
          : {},
      formError:
        result.reason === "type-locked"
          ? undefined
          : FAILURE_MESSAGES[result.reason],
      values: formValues(formData),
    };
  }
  refreshApp();
  redirect(`/accounts/${accountId}`);
}

export async function recordBalanceAction(
  accountId: string,
  _previous: BalanceFormState,
  formData: FormData,
): Promise<BalanceFormState> {
  const user = await requireUser();
  const prisma = getPrisma();
  const type = await getAccountType(prisma, user.id, accountId);
  if (!type) {
    return {
      status: "error",
      fieldErrors: {},
      formError: FAILURE_MESSAGES["not-found"],
      values: formValues(formData),
    };
  }
  const parsed = parseBalanceForm(type, formData);
  if (!parsed.ok) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      values: formValues(formData),
    };
  }
  const result = await recordBalance(prisma, user.id, accountId, parsed.data, {
    // Set only by the form's explicit "Replace" choice, and only for the date it was shown for.
    replaceExisting: parsed.data.asOfDate === formData.get("replaceExisting"),
  });
  if (!result.ok && result.reason === "exists") {
    return {
      status: "confirm-replace",
      existingCents: result.existingCents,
      values: formValues(formData),
    };
  }
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: FAILURE_MESSAGES[result.reason],
      values: formValues(formData),
    };
  }
  refreshApp();
  return {
    status: "saved",
    message: result.value.replaced
      ? "Balance replaced. The earlier manual entry for that date was overwritten."
      : "Balance saved.",
  };
}

export async function deleteManualBalanceAction(
  accountId: string,
  entryId: string,
): Promise<ActionState> {
  const user = await requireUser();
  const result = await deleteManualBalance(
    getPrisma(),
    user.id,
    accountId,
    entryId,
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError:
        result.reason === "not-found"
          ? "That entry no longer exists, or it didn't come from a manual update."
          : FAILURE_MESSAGES[result.reason],
      values: {},
    };
  }
  refreshApp();
  return { status: "saved", message: "Entry removed." };
}

export async function setArchivedAction(
  accountId: string,
  archived: boolean,
): Promise<ActionState> {
  const user = await requireUser();
  const result = await setAccountArchived(
    getPrisma(),
    user.id,
    accountId,
    archived,
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: FAILURE_MESSAGES[result.reason],
      values: {},
    };
  }
  refreshApp();
  return {
    status: "saved",
    message: archived ? "Account archived." : "Account restored.",
  };
}

export async function deleteAccountAction(
  accountId: string,
): Promise<ActionState> {
  const user = await requireUser();
  const result = await deleteAccount(getPrisma(), user.id, accountId);
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: FAILURE_MESSAGES[result.reason],
      values: {},
    };
  }
  refreshApp();
  redirect("/accounts");
}
