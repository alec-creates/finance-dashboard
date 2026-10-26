"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { AccountFormState } from "@/app/(app)/accounts/actions";
import { FormError } from "@/components/auth/auth-card";
import { describedBy, Field, fieldIds } from "@/components/forms/field";
import { useVisibleErrors } from "@/components/forms/use-visible-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ACCOUNT_GROUPS,
  ACCOUNT_TYPE_LABELS,
  INVESTMENT_ACCOUNT_TYPES,
  INVESTMENT_TYPE_LABELS,
  supportsSafeToSpend,
  type AccountType,
} from "@/lib/accounts";

export interface AccountFormDefaults {
  name: string;
  type: AccountType | "";
  investmentType: string;
  institutionName: string;
  mask: string;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  minimumBalance: string;
}

export const NEW_ACCOUNT_DEFAULTS: AccountFormDefaults = {
  name: "",
  type: "",
  investmentType: "",
  institutionName: "",
  mask: "",
  includeInNetWorth: true,
  includeInSafeToSpend: false,
  minimumBalance: "",
};

/** Create or edit an account. `allowedTypes` narrows the type choice once history exists. */
export function AccountForm({
  action,
  defaults,
  allowedTypes,
  lockedInvestmentType = false,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
  defaults: AccountFormDefaults;
  allowedTypes?: readonly AccountType[];
  lockedInvestmentType?: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  // A changed type also settles errors about the investment kind and the minimum balance.
  const { errors, onChange } = useVisibleErrors(
    state,
    state.status === "error" ? state.fieldErrors : {},
    { type: ["investmentType", "minimumBalance"] },
  );
  const submitted = state.status === "error" ? state.values : null;
  const value = (field: keyof AccountFormDefaults & string): string =>
    submitted ? (submitted[field] ?? "") : String(defaults[field]);
  const checked = (field: "includeInNetWorth" | "includeInSafeToSpend") =>
    submitted ? submitted[field] === "on" : defaults[field];

  const [type, setType] = useState<string>(defaults.type);
  const isInvestment = type === "INVESTMENT";
  const spendable = type !== "" && supportsSafeToSpend(type as AccountType);
  const typeChoices = allowedTypes ?? null;

  return (
    <form
      action={formAction}
      onChange={onChange}
      className="space-y-6"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field name="name" label="Account name" error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={value("name")}
              maxLength={80}
              autoComplete="off"
              required
              className="h-10"
              placeholder="Everyday checking"
              {...describedBy("name", { error: errors.name })}
            />
          </Field>
        </div>

        <Field
          name="type"
          label="Type"
          error={errors.type}
          hint={
            !typeChoices
              ? undefined
              : typeChoices.length === 1
                ? "The type can't change after balances are recorded."
                : "With balances recorded, only checking, savings and cash can be swapped."
          }
        >
          <NativeSelect
            id="type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            required
            className="w-full"
            {...describedBy("type", {
              error: errors.type,
              hint: typeChoices !== null,
            })}
          >
            <NativeSelectOption value="" disabled>
              Choose a type
            </NativeSelectOption>
            {ACCOUNT_GROUPS.map((group) => {
              const types = group.types.filter(
                (option) => !typeChoices || typeChoices.includes(option),
              );
              return types.length === 0 ? null : (
                <NativeSelectOptGroup key={group.id} label={group.label}>
                  {types.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {ACCOUNT_TYPE_LABELS[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              );
            })}
          </NativeSelect>
        </Field>

        {isInvestment ? (
          <Field
            name="investmentType"
            label="Kind of investment account"
            error={errors.investmentType}
            hint={
              lockedInvestmentType
                ? "Fixed once values are recorded: tax treatment depends on it."
                : "A retirement account is its own account, even at the same broker."
            }
          >
            <NativeSelect
              id="investmentType"
              name="investmentType"
              defaultValue={value("investmentType")}
              disabled={lockedInvestmentType}
              required
              className="w-full"
              {...describedBy("investmentType", {
                error: errors.investmentType,
                hint: true,
              })}
            >
              <NativeSelectOption value="" disabled>
                Choose a kind
              </NativeSelectOption>
              {INVESTMENT_ACCOUNT_TYPES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {INVESTMENT_TYPE_LABELS[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {lockedInvestmentType ? (
              // Disabled controls are not submitted; send the fixed value.
              <input
                type="hidden"
                name="investmentType"
                value={defaults.investmentType}
              />
            ) : null}
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}

        <Field
          name="institutionName"
          label="Institution"
          optional
          error={errors.institutionName}
        >
          <Input
            id="institutionName"
            name="institutionName"
            defaultValue={value("institutionName")}
            maxLength={80}
            autoComplete="off"
            className="h-10"
            placeholder="Bank or broker name"
            {...describedBy("institutionName", {
              error: errors.institutionName,
            })}
          />
        </Field>

        <Field
          name="mask"
          label="Last digits"
          optional
          hint="Only the last 2 to 4 digits, to tell accounts apart. Never the full number."
          error={errors.mask}
        >
          <Input
            id="mask"
            name="mask"
            defaultValue={value("mask")}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className="h-10 font-mono"
            placeholder="1234"
            {...describedBy("mask", { error: errors.mask, hint: true })}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Totals</legend>
        <CheckboxRow
          name="includeInNetWorth"
          defaultChecked={checked("includeInNetWorth")}
          label="Include in net worth"
          hint="Turn off for accounts you track but don't own outright, such as a shared or custodial account."
        />
      </fieldset>

      {spendable ? (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Safe to Spend</legend>
          <CheckboxRow
            name="includeInSafeToSpend"
            defaultChecked={checked("includeInSafeToSpend")}
            label="Count this account's balance as spendable"
            hint="Only accounts you spend from day to day. Savings for goals usually stay off."
          />
          <Field
            name="minimumBalance"
            label="Minimum balance to keep"
            optional
            hint="Safe to Spend leaves at least this much in the account."
            error={errors.minimumBalance}
          >
            <Input
              id="minimumBalance"
              name="minimumBalance"
              defaultValue={value("minimumBalance")}
              inputMode="decimal"
              autoComplete="off"
              className="h-10 sm:max-w-48"
              placeholder="0.00"
              {...describedBy("minimumBalance", {
                error: errors.minimumBalance,
                hint: true,
              })}
            />
          </Field>
        </fieldset>
      ) : null}

      {state.status === "error" && state.formError ? (
        <FormError message={state.formError} />
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-10">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10 sm:min-w-36">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CheckboxRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  const ids = fieldIds(name);
  return (
    <div className="flex gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={ids.hint}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div className="space-y-1">
        <label htmlFor={name} className="text-sm leading-none font-medium">
          {label}
        </label>
        <p id={ids.hint} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}
