"use client";

import { useState, type FormEvent } from "react";

import { visibleFieldErrors } from "@/lib/form-errors";

const NOTHING_EDITED: ReadonlySet<string> = new Set();

/**
 * Tracks which fields the owner edited since the last server response, and hides their now-stale errors. `result` is
 * the action state object: a new response starts a fresh, empty set, so errors from that response all show.
 * Attach `onChange` to the <form>; change events bubble from every input, select and checkbox.
 */
export function useVisibleErrors<Field extends string>(
  result: unknown,
  errors: Partial<Record<Field, string>>,
  dependents?: Partial<Record<string, readonly NoInfer<Field>[]>>,
) {
  const [edited, setEdited] = useState<{
    result: unknown;
    fields: ReadonlySet<string>;
  }>({ result, fields: NOTHING_EDITED });
  const fields = edited.result === result ? edited.fields : NOTHING_EDITED;

  function onChange(event: FormEvent<HTMLFormElement>) {
    // Change events bubble up from the control that changed.
    const name = (event.target as unknown as HTMLInputElement).name;
    if (!name || fields.has(name)) {
      return;
    }
    setEdited({ result, fields: new Set([...fields, name]) });
  }

  return {
    errors: visibleFieldErrors(errors, fields, dependents),
    onChange,
  };
}
