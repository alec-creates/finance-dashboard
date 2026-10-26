"use client";

import { useSyncExternalStore } from "react";

import {
  DARK_MEDIA_QUERY,
  isDarkTheme,
  parseThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

const CHANGE_EVENT = "finance:theme-change";

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system"; // storage blocked: the theme still follows the system
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // another tab
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Saves the choice and applies it at once. The inline init script applies it on later page loads. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage blocked: apply for this page only.
  }
  const dark = isDarkTheme(
    preference,
    window.matchMedia(DARK_MEDIA_QUERY).matches,
  );
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The saved preference. The server render (and hydration) uses "system", then the stored value takes over. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => "system");
}
