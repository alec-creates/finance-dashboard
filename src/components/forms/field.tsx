import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

/** Ids that tie a control to its hint and error, for aria-describedby. */
export function fieldIds(name: string) {
  return { hint: `${name}-hint`, error: `${name}-error` };
}

/** aria props for a control, so screen readers announce its hint and error. */
export function describedBy(
  name: string,
  { hint, error }: { hint?: boolean; error?: string },
) {
  const ids = fieldIds(name);
  const describedByIds = [hint ? ids.hint : null, error ? ids.error : null]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedByIds || undefined,
  } as const;
}

/** Label, control, optional hint and error message, stacked. */
export function Field({
  name,
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const ids = fieldIds(name);
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {optional ? " " : null}
        {optional ? (
          <span className="font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p id={ids.hint} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.error} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
