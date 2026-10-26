"use client";

import { useActionState, useSyncExternalStore } from "react";

import type { BalanceFormState } from "@/app/(app)/accounts/actions";
import { FormError } from "@/components/auth/auth-card";
import { describedBy, Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { balanceAmountLabel } from "@/lib/account-forms";
import {
  isLiabilityType,
  supportsSafeToSpend,
  type AccountType,
} from "@/lib/accounts";

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const noSubscription = () => () => {};

/** The browser's local date; empty during server rendering, filled in once hydrated. */
function useLocalToday(): string {
  return useSyncExternalStore(noSubscription, localToday, () => "");
}

/** Records a balance (or an investment account's value) as of a date. */
export function BalanceForm({
  type,
  action,
}: {
  type: AccountType;
  action: (
    state: BalanceFormState,
    formData: FormData,
  ) => Promise<BalanceFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  const today = useLocalToday();
  const errors = state.status === "error" ? state.fieldErrors : {};
  const submitted = state.status === "error" ? state.values : null;
  const isInvestment = type === "INVESTMENT";

  const amountHint = isInvestment
    ? "Holdings at market value plus any cash in the account."
    : isLiabilityType(type)
      ? "What you owe, as on the statement or app. Enter a negative amount for a credit balance."
      : "The current (ledger) balance. It can be negative if the account is overdrawn.";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="asOfDate" label="As of" error={errors.asOfDate}>
          <Input
            // Remounts once the local date is known, so the default appears without a hydration mismatch.
            key={submitted ? "submitted" : today}
            id="asOfDate"
            name="asOfDate"
            type="date"
            defaultValue={submitted?.asOfDate ?? today}
            max={today || undefined}
            required
            className="h-10"
            {...describedBy("asOfDate", { error: errors.asOfDate })}
          />
        </Field>
        <Field
          name="amount"
          label={balanceAmountLabel(type)}
          hint={amountHint}
          error={errors.amount}
        >
          <Input
            id="amount"
            name="amount"
            defaultValue={submitted?.amount ?? ""}
            inputMode="decimal"
            autoComplete="off"
            required
            className="h-10"
            placeholder="0.00"
            {...describedBy("amount", { error: errors.amount, hint: true })}
          />
        </Field>
        {isInvestment ? (
          <Field
            name="cash"
            label="Of which cash"
            optional
            hint="Part of the total above, not in addition to it."
            error={errors.cash}
          >
            <Input
              id="cash"
              name="cash"
              defaultValue={submitted?.cash ?? ""}
              inputMode="decimal"
              autoComplete="off"
              className="h-10"
              placeholder="0.00"
              {...describedBy("cash", { error: errors.cash, hint: true })}
            />
          </Field>
        ) : null}
        {supportsSafeToSpend(type) ? (
          <Field
            name="available"
            label="Available balance"
            optional
            hint="If your bank shows a different available amount (pending items, holds)."
            error={errors.available}
          >
            <Input
              id="available"
              name="available"
              defaultValue={submitted?.available ?? ""}
              inputMode="decimal"
              autoComplete="off"
              className="h-10"
              placeholder="0.00"
              {...describedBy("available", {
                error: errors.available,
                hint: true,
              })}
            />
          </Field>
        ) : null}
      </div>

      {state.status === "error" && state.formError ? (
        <FormError message={state.formError} />
      ) : null}
      {state.status === "saved" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full sm:w-auto"
      >
        {pending ? "Saving…" : "Save balance"}
      </Button>
    </form>
  );
}
