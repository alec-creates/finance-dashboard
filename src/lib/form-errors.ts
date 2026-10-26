/**
 * Which server-side field errors are still worth showing. An error is hidden once the owner edits that field, or a
 * field it depends on (changing the total can resolve a "cash exceeds total" error). The server still validates every
 * submission, so a hidden error comes back if the new value is also wrong.
 */
export function visibleFieldErrors<Field extends string>(
  errors: Partial<Record<Field, string>>,
  edited: ReadonlySet<string>,
  dependents: Partial<Record<string, readonly Field[]>> = {},
): Partial<Record<Field, string>> {
  const cleared = new Set<string>(edited);
  for (const field of edited) {
    for (const dependent of dependents[field] ?? []) {
      cleared.add(dependent);
    }
  }
  const visible: Partial<Record<Field, string>> = {};
  for (const [field, message] of Object.entries(errors) as [Field, string][]) {
    if (message && !cleared.has(field)) {
      visible[field] = message;
    }
  }
  return visible;
}
