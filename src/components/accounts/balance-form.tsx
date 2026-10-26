"use client";

import { CircleAlertIcon } from "lucide-react";
import { useActionState, useState, useSyncExternalStore } from "react";

import type { BalanceFormState } from "@/app/(app)/accounts/actions";
import { FormError } from "@/components/auth/auth-card";
import { describedBy, Field } from "@/components/forms/field";
import { useVisibleErrors } from "@/components/forms/use-visible-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { balanceAmountLabel } from "@/lib/account-forms";
import {
  isLiabilityType,
  supportsSafeToSpend,
  type AccountType,
} from "@/lib/accounts";
import { formatCalendarDate, isCalendarDate } from "@/lib/dates";

import { BalanceAmount } from "./balance-amount";

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

/**
 * Records a balance (or an investment account's value) as of a date. Picking a date that already has a manual entry
 * shows that entry and turns saving into an explicit replacement; the server asks the same way for dates the page
 * does not know about.
 */
export function BalanceForm({
  type,
  action,
  manualEntries,
}: {
  type: AccountType;
  /** Manual entries shown on the page: date (YYYY-MM-DD) -> stored amount. */
  manualEntries: Readonly<Record<string, number>>;
  action: (
    state: BalanceFormState,
    formData: FormData,
  ) => Promise<BalanceFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  const today = useLocalToday();
  // Editing the total can settle a "cash exceeds total" error.
  const { errors, onChange: clearStaleErrors } = useVisibleErrors(
    state,
    state.status === "error" ? state.fieldErrors : {},
    { amount: ["cash"] },
  );
  const submitted =
    state.status === "error" || state.status === "confirm-replace"
      ? state.values
      : null;

  // The date currently in the field (it is uncontrolled; a new server response resets it).
  const [picked, setPicked] = useState<{ result: unknown; date: string }>();
  const date =
    picked?.result === state ? picked.date : (submitted?.asOfDate ?? today);
  const existingCents =
    state.status === "confirm-replace" && state.values.asOfDate === date
      ? state.existingCents
      : manualEntries[date];
  const replacing = existingCents !== undefined;
  const isInvestment = type === "INVESTMENT";

  const amountHint = isInvestment
    ? "Holdings at market value plus any cash in the account."
    : isLiabilityType(type)
      ? "What you owe, as on the statement or app. Enter a negative amount for a credit balance."
      : "The current (ledger) balance. It can be negative if the account is overdrawn.";

  return (
    <form
      action={formAction}
      onChange={(event) => {
        clearStaleErrors(event);
        const target = event.target as unknown as HTMLInputElement;
        if (target.name === "asOfDate") {
          setPicked({ result: state, date: target.value });
        }
      }}
      className="space-y-5"
      noValidate
    >
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

      {replacing ? (
        <Alert role="status">
          <CircleAlertIcon aria-hidden />
          <AlertDescription className="text-foreground">
            <p>
              You already entered{" "}
              <BalanceAmount
                type={type}
                cents={existingCents}
                className="font-medium"
              />{" "}
              for {isCalendarDate(date) ? formatCalendarDate(date) : date}.
              Saving replaces that entry; the earlier value isn&apos;t kept.
            </p>
          </AlertDescription>
          {/* The explicit choice the server requires, bound to the date it was shown for. */}
          <input type="hidden" name="replaceExisting" value={date} />
        </Alert>
      ) : null}
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
        {pending ? "Saving…" : replacing ? "Replace balance" : "Save balance"}
      </Button>
    </form>
  );
}
