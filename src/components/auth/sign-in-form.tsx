"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";
import { navigateWithFullReload } from "@/lib/navigation";

import { buttonClass, FormError, inputClass, labelClass } from "./auth-card";

export function SignInForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const { data, error: authError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (authError) {
      setPending(false);
      setError(describeAuthError(authError, "signIn"));
      return;
    }
    // Full reloads drop the typed password from memory instead of keeping this form alive but hidden.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      navigateWithFullReload("/two-factor"); // password accepted; a code is still required
      return;
    }
    navigateWithFullReload("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <FormError message={error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
