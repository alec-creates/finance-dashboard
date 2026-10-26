"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import {
  createCategoryAction,
  setCategoryArchivedAction,
  updateCategoryAction,
  type CategoryFormState,
} from "@/app/(app)/transactions/actions";
import { FormError } from "@/components/auth/auth-card";
import { describedBy, Field } from "@/components/forms/field";
import { useVisibleErrors } from "@/components/forms/use-visible-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface ManagedCategory {
  id: string;
  name: string;
  type: "EXPENSE" | "INCOME";
  isEssential: boolean;
  archived: boolean;
  usedBy: number;
  children: ManagedCategory[];
}

const TYPE_LABEL = { EXPENSE: "spending", INCOME: "income" } as const;

/** One section (spending or income): parents with their subcategories. */
export function CategoryList({
  categories,
}: {
  categories: ManagedCategory[];
}) {
  return (
    <ul className="divide-y">
      {categories.map((parent) => (
        <li key={parent.id}>
          <CategoryRow category={parent} />
          {parent.children.length > 0 ? (
            <ul className="divide-y border-t border-dashed">
              {parent.children.map((child) => (
                <li key={child.id} className="pl-6">
                  <CategoryRow category={child} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({ category }: { category: ManagedCategory }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleArchived() {
    setMessage("");
    startTransition(async () => {
      const result = await setCategoryArchivedAction(
        category.id,
        !category.archived,
      );
      if (result.status === "error") {
        setMessage(result.formError ?? "Something went wrong.");
      }
    });
  }

  if (editing) {
    return (
      <EditCategoryForm category={category} onDone={() => setEditing(false)} />
    );
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "text-sm",
              category.archived && "text-muted-foreground line-through",
            )}
          >
            {category.name}
          </span>
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {category.isEssential ? (
              <Badge variant="secondary">Essential</Badge>
            ) : null}
            {category.archived ? (
              <Badge variant="outline">Archived</Badge>
            ) : null}
          </span>
          {category.usedBy > 0 ? (
            <span className="block text-xs text-muted-foreground">
              Used by {category.usedBy} split{category.usedBy === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {category.archived ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Rename ${category.name}`}
            onClick={() => setEditing(true)}
          >
            <PencilIcon aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // Not disabled for rule reasons: the server's explanation is shown instead, which also works by keyboard.
          disabled={pending}
          aria-label={`${category.archived ? "Restore" : "Archive"} ${category.name}`}
          onClick={toggleArchived}
        >
          {category.archived ? (
            <ArchiveRestoreIcon aria-hidden />
          ) : (
            <ArchiveIcon aria-hidden />
          )}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function EditCategoryForm({
  category,
  onDone,
}: {
  category: ManagedCategory;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: CategoryFormState, formData: FormData) => {
      const result = await updateCategoryAction(
        category.id,
        previous,
        formData,
      );
      if (result.status === "saved") {
        onDone();
      }
      return result;
    },
    { status: "idle" },
  );
  const { errors, onChange } = useVisibleErrors(
    state,
    state.status === "error" ? state.fieldErrors : {},
  );
  const nameId = `rename-${category.id}`;
  return (
    <form
      action={formAction}
      onChange={onChange}
      className="space-y-3 bg-muted/40 px-4 py-3"
      noValidate
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor={nameId} className="text-sm font-medium">
            Name
          </label>
          <Input
            id={nameId}
            name="name"
            defaultValue={category.name}
            maxLength={60}
            autoFocus
            className="h-9"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
          />
        </div>
        <label className="flex items-center gap-2 text-sm sm:pb-2">
          <input
            type="checkbox"
            name="isEssential"
            defaultChecked={category.isEssential}
            className="size-4 accent-primary"
          />
          Essential
        </label>
      </div>
      {errors.name ? (
        <p id={`${nameId}-error`} className="text-sm text-destructive">
          {errors.name}
        </p>
      ) : null}
      {state.status === "error" && state.formError ? (
        <FormError message={state.formError} />
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Adds a top-level category or a subcategory; a subcategory takes its parent's type. */
export function AddCategoryForm({
  parents,
}: {
  parents: { id: string; name: string; type: "EXPENSE" | "INCOME" }[];
}) {
  const [state, formAction, pending] = useActionState(createCategoryAction, {
    status: "idle",
  });
  const { errors, onChange } = useVisibleErrors(
    state,
    state.status === "error" ? state.fieldErrors : {},
    { placement: ["parentId", "type"] },
  );
  const [placement, setPlacement] = useState("top:EXPENSE");
  const parentId = placement.startsWith("top:") ? "" : placement;
  const type = placement.startsWith("top:")
    ? placement.slice(4)
    : (parents.find((parent) => parent.id === placement)?.type ?? "EXPENSE");

  return (
    <form
      action={formAction}
      onChange={onChange}
      className="space-y-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="newCategoryName" label="Name" error={errors.name}>
          <Input
            id="newCategoryName"
            name="name"
            maxLength={60}
            autoComplete="off"
            className="h-10"
            {...describedBy("newCategoryName", { error: errors.name })}
          />
        </Field>
        <Field
          name="placement"
          label="Where"
          error={errors.parentId ?? errors.type}
        >
          <NativeSelect
            id="placement"
            name="placement"
            value={placement}
            onChange={(event) => setPlacement(event.target.value)}
            className="w-full"
          >
            <NativeSelectOptGroup label="New top-level category">
              <NativeSelectOption value="top:EXPENSE">
                Top level, spending
              </NativeSelectOption>
              <NativeSelectOption value="top:INCOME">
                Top level, income
              </NativeSelectOption>
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Subcategory of">
              {parents.map((parent) => (
                <NativeSelectOption key={parent.id} value={parent.id}>
                  {parent.name} ({TYPE_LABEL[parent.type]})
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </NativeSelect>
        </Field>
      </div>
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="type" value={type} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isEssential"
          className="size-4 accent-primary"
        />
        Essential (needed every month, like rent or groceries)
      </label>
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
        {pending ? "Adding…" : "Add category"}
      </Button>
    </form>
  );
}
