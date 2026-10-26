"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";
import {
  MIN_PASSWORD_LENGTH,
  TWO_FACTOR_SETUP_PATH,
} from "@/server/auth/constants";

import { buttonClass, FormError, inputClass, labelClass } from "./auth-card";

/** One-time creation of the owner account. The server accepts only the configured owner email. */
export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    setError("");
    const { error: authError } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim() || "Owner",
      email: String(form.get("email") ?? ""),
      password,
    });
    if (authError) {
      setPending(false);
      setError(describeAuthError(authError, "signUp"));
      return;
    }
    router.replace(TWO_FACTOR_SETUP_PATH);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Owner email
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
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className={inputClass}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1 text-xs text-zinc-500">
          At least {MIN_PASSWORD_LENGTH} characters. A passphrase from a
          password manager works well.
        </p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </div>
      <FormError message={error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating account…" : "Create owner account"}
      </button>
    </form>
  );
}
