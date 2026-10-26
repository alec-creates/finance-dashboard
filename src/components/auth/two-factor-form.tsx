"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";

import { buttonClass, FormError, inputClass, labelClass } from "./auth-card";

/** Second step of sign-in: a code from the authenticator app, or a one-time backup code. */
export function TwoFactorForm() {
  const router = useRouter();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).replace(/\s+/g, "");
    setPending(true);
    setError("");
    const { error: authError } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (authError) {
      setPending(false);
      setError(describeAuthError(authError, "twoFactor"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="code" className={labelClass}>
          {useBackupCode
            ? "Backup code"
            : "6-digit code from your authenticator app"}
        </label>
        <input
          id="code"
          name="code"
          key={useBackupCode ? "backup" : "totp"}
          inputMode={useBackupCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={useBackupCode ? undefined : "[0-9]*"}
          maxLength={useBackupCode ? 32 : 6}
          required
          autoFocus
          className={inputClass}
        />
      </div>
      <FormError message={error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Checking…" : "Verify"}
      </button>
      <button
        type="button"
        onClick={() => {
          setUseBackupCode((value) => !value);
          setError("");
        }}
        className="w-full text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        {useBackupCode
          ? "Use the authenticator app instead"
          : "Use a backup code instead"}
      </button>
    </form>
  );
}
