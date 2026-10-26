"use client";

import { PlusIcon, SplitIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore } from "react";

import type { TransactionFormState } from "@/app/(app)/transactions/actions";
import { FormError } from "@/components/auth/auth-card";
import { describedBy, Field } from "@/components/forms/field";
import { useVisibleErrors } from "@/components/forms/use-visible-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd, parseUsdToCents, centsToDecimalString } from "@/lib/money";
import {
  evenSplits,
  KIND_GROUPS,
  KIND_RULES,
  MAX_SPLITS,
  unassignedCents,
  type CategoryType,
  type TxnKind,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  id: string;
  name: string;
  type: CategoryType;
  /** False for an archived parent that is listed only for its subcategory. */
  selectable: boolean;
  /** Subcategories, by name. */
  children: { id: string; name: string }[];
}

export interface TransactionFormDefaults {
  accountId: string;
  date: string;
  description: string;
  kind: TxnKind;
  direction: "" | "in" | "out";
  /** Positive magnitude, as typed. */
  amount: string;
  notes: string;
  splits: { category: string; amount: string }[];
}

interface Row {
  key: number;
  category: string;
  amount: string;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
const noSubscription = () => () => {};

/** Cents from a typed amount, or null while it isn't a valid amount yet. */
function centsOf(text: string): number | null {
  if (text.trim() === "") {
    return null;
  }
  try {
    return parseUsdToCents(text);
  } catch {
    return null;
  }
}

export function TransactionForm({
  action,
  accounts,
  categories,
  defaults,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: TransactionFormState,
    formData: FormData,
  ) => Promise<TransactionFormState>;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  defaults: TransactionFormDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  const today = useSyncExternalStore(noSubscription, localToday, () => "");
  const fieldErrors = state.status === "error" ? state.fieldErrors : {};
  const rowErrorKeys = Object.keys(fieldErrors).filter((key) =>
    key.startsWith("splitAmount."),
  ) as `splitAmount.${number}`[];
  const { errors, onChange } = useVisibleErrors(state, fieldErrors, {
    amount: ["splits"],
    kind: ["splits", "direction"],
    splitAmount: ["splits", ...rowErrorKeys],
    splitCategory: ["splits"],
  });

  // Every field is controlled, so a failed save keeps exactly what was typed.
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [date, setDate] = useState<string | null>(defaults.date || null);
  const [description, setDescription] = useState(defaults.description);
  const [kind, setKind] = useState<TxnKind>(defaults.kind);
  const [direction, setDirection] = useState(defaults.direction);
  const [amount, setAmount] = useState(defaults.amount);
  const [notes, setNotes] = useState(defaults.notes);
  const [nextKey, setNextKey] = useState(defaults.splits.length + 1);
  const [rows, setRows] = useState<Row[]>(
    (defaults.splits.length > 0
      ? defaults.splits
      : [{ category: "", amount: "" }]
    ).map((split, index) => ({ key: index, ...split })),
  );

  const rule = KIND_RULES[kind];
  const categoryType = rule.categoryType;
  const splitting = categoryType !== null && rows.length > 1;
  const totalCents = centsOf(amount);
  const options = categories.filter((option) => option.type === categoryType);
  const ids = useId();

  function changeKind(next: TxnKind) {
    const nextType = KIND_RULES[next].categoryType;
    setKind(next);
    if (nextType !== categoryType) {
      // Categories of the old type don't apply; movements are never split.
      setRows((current) =>
        nextType === null
          ? [{ key: current[0]?.key ?? 0, category: "", amount: "" }]
          : current.map((row) => ({ ...row, category: "" })),
      );
    }
  }

  function updateRow(key: number, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function addRow(prefill: string) {
    setRows((current) => [
      ...current,
      { key: nextKey, category: "", amount: prefill },
    ]);
    setNextKey((key) => key + 1);
  }

  function startSplitting() {
    // The current category keeps the whole amount; the new row starts empty.
    setRows((current) => [
      { ...(current[0] ?? { key: 0, category: "" }), amount: amount },
    ]);
    addRow("");
  }

  function divideEvenly() {
    if (totalCents === null || totalCents <= 0) {
      return;
    }
    const parts = evenSplits(totalCents, rows.length);
    setRows((current) =>
      current.map((row, index) => ({
        ...row,
        amount: centsToDecimalString(parts[index] ?? 0),
      })),
    );
  }

  const splitCents = rows.map((row) => centsOf(row.amount));
  const remaining =
    splitting && totalCents !== null && splitCents.every((c) => c !== null)
      ? unassignedCents(totalCents, splitCents as number[])
      : null;
  const effectiveDate = date ?? today;

  return (
    <form
      action={formAction}
      onChange={onChange}
      className="space-y-6"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="kind"
          label="Kind"
          error={errors.kind}
          hint={rule.description}
        >
          <NativeSelect
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => changeKind(event.target.value as TxnKind)}
            className="w-full"
            {...describedBy("kind", { error: errors.kind, hint: true })}
          >
            {KIND_GROUPS.map((group) => (
              <NativeSelectOptGroup key={group.label} label={group.label}>
                {group.kinds.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {KIND_RULES[option].label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </Field>

        <Field name="accountId" label="Account" error={errors.accountId}>
          <NativeSelect
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full"
            {...describedBy("accountId", { error: errors.accountId })}
          >
            <NativeSelectOption value="" disabled>
              Choose an account
            </NativeSelectOption>
            {accounts.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <div className="sm:col-span-2">
          <Field
            name="description"
            label="Description"
            error={errors.description}
          >
            <Input
              id="description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              autoComplete="off"
              className="h-10"
              placeholder="Merchant or note, as on your statement"
              {...describedBy("description", { error: errors.description })}
            />
          </Field>
        </div>

        <Field name="date" label="Date" error={errors.date}>
          <Input
            id="date"
            name="date"
            type="date"
            value={effectiveDate}
            onChange={(event) => setDate(event.target.value)}
            max={today || undefined}
            className="h-10"
            {...describedBy("date", { error: errors.date })}
          />
        </Field>

        <Field
          name="amount"
          label="Amount"
          error={errors.amount}
          hint={
            rule.direction === "either"
              ? "Without a sign. Choose the direction below."
              : rule.direction === "out"
                ? "Without a sign. Recorded as money out."
                : "Without a sign. Recorded as money in."
          }
        >
          <Input
            id="amount"
            name="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="h-10"
            placeholder="0.00"
            {...describedBy("amount", { error: errors.amount, hint: true })}
          />
        </Field>
      </div>

      {rule.direction === "either" ? (
        <fieldset
          className="space-y-2"
          aria-describedby={
            errors.direction ? `${ids}-direction-error` : undefined
          }
        >
          <legend className="text-sm font-medium">Direction</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["out", "Money out of this account"],
                ["in", "Money into this account"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  direction === value && "border-foreground/30 bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          {errors.direction ? (
            <p
              id={`${ids}-direction-error`}
              className="text-sm text-destructive"
            >
              {errors.direction}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {categoryType !== null ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            {splitting ? "Split across categories" : "Category"}
          </legend>
          {rows.map((row, index) => {
            const rowError = errors[`splitAmount.${index}`];
            return (
              <div key={row.key} className="space-y-1">
                <div className="flex items-start gap-2">
                  <NativeSelect
                    name="splitCategory"
                    value={row.category}
                    onChange={(event) =>
                      updateRow(row.key, { category: event.target.value })
                    }
                    aria-label={
                      splitting ? `Split ${index + 1} category` : "Category"
                    }
                    className="min-w-0 flex-1"
                  >
                    <NativeSelectOption value="">
                      Uncategorized
                    </NativeSelectOption>
                    {options.map((parent) => (
                      <NativeSelectOptGroup key={parent.id} label={parent.name}>
                        {parent.selectable ? (
                          <NativeSelectOption value={parent.id}>
                            {parent.name} (general)
                          </NativeSelectOption>
                        ) : null}
                        {parent.children.map((child) => (
                          <NativeSelectOption key={child.id} value={child.id}>
                            {child.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                    ))}
                  </NativeSelect>
                  {splitting ? (
                    <>
                      <Input
                        name="splitAmount"
                        value={row.amount}
                        onChange={(event) =>
                          updateRow(row.key, { amount: event.target.value })
                        }
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        aria-label={`Split ${index + 1} amount`}
                        aria-invalid={rowError ? true : undefined}
                        className="h-8 w-28 shrink-0"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove split ${index + 1}`}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((other) => other.key !== row.key),
                          )
                        }
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </>
                  ) : (
                    // One category: the split takes the whole amount.
                    <input type="hidden" name="splitAmount" value="" />
                  )}
                </div>
                {rowError ? (
                  <p className="text-sm text-destructive">{rowError}</p>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            {splitting ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rows.length >= MAX_SPLITS}
                  onClick={() =>
                    addRow(
                      remaining !== null && remaining > 0
                        ? centsToDecimalString(remaining)
                        : "",
                    )
                  }
                >
                  <PlusIcon aria-hidden />
                  Add split
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={totalCents === null || totalCents <= 0}
                  onClick={divideEvenly}
                >
                  Divide evenly
                </Button>
                <p
                  className={cn(
                    "text-sm",
                    remaining === 0
                      ? "text-muted-foreground"
                      : "font-medium text-destructive",
                  )}
                  aria-live="polite"
                >
                  {remaining === null
                    ? "Enter every amount to check the total."
                    : remaining === 0
                      ? "Every cent is assigned."
                      : remaining > 0
                        ? `${formatUsd(remaining)} left to assign`
                        : `${formatUsd(-remaining)} too much`}
                </p>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startSplitting}
              >
                <SplitIcon aria-hidden />
                Split across categories
              </Button>
            )}
          </div>
          {errors.splits ? (
            <p className="text-sm text-destructive">{errors.splits}</p>
          ) : null}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          {rule.label} transactions aren&apos;t categorized and don&apos;t count
          as income or spending.
          {errors.splits ? (
            <span className="block text-destructive">{errors.splits}</span>
          ) : null}
        </p>
      )}

      <Field name="notes" label="Notes" optional error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          rows={2}
          {...describedBy("notes", { error: errors.notes })}
        />
      </Field>

      {state.status === "error" && state.formError ? (
        <FormError message={state.formError} />
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-10">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10 sm:min-w-40">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
