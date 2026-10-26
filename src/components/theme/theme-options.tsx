"use client";

import { cn } from "@/lib/utils";

import { THEME_OPTIONS } from "./theme-toggle";
import { setThemePreference, useThemePreference } from "./use-theme-preference";

/** Light / dark / system as a native radio group (arrow keys move between options). */
export function ThemeOptions() {
  const preference = useThemePreference();
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              preference === value
                ? "border-foreground/30 bg-muted"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setThemePreference(value)}
              className="sr-only"
            />
            <Icon className="size-5" aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
