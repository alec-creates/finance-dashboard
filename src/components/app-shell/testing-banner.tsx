import { FlaskConicalIcon } from "lucide-react";

/**
 * Shown on every page of the production deployment until real financial data is approved (gate B in TASKS.md).
 * Production may hold invented test data only while it is visible.
 */
export function TestingBanner() {
  return (
    <div
      role="note"
      aria-label="Testing deployment"
      className="relative z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 sm:text-sm"
    >
      <FlaskConicalIcon className="size-4 shrink-0" aria-hidden />
      <span>Testing &ndash; do not enter real financial data.</span>
    </div>
  );
}
