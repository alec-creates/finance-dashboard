import type { FieldErrors } from "./account-forms";

/** What a form's Server Action returns: expected failures are values, never thrown errors. */
export type FormState<Field extends string, Values = Record<string, string>> =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | {
      status: "error";
      fieldErrors: FieldErrors<Field>;
      formError?: string;
      /** What was submitted, so the form can show it again (React resets forms after an action). */
      values: Values;
    };

/** The submitted text fields (first value of each), without React's internal `$ACTION` fields. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$") && !(key in values)) {
      values[key] = value;
    }
  }
  return values;
}
