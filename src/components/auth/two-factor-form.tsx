"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";
import { navigateWithFullReload } from "@/lib/navigation";

import { FormError } from "./auth-card";

/** Second step of sign-in: a code from the authenticator app, or a one-time backup code. */
export function TwoFactorForm() {
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
    navigateWithFullReload("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">
          {useBackupCode
            ? "Backup code"
            : "6-digit code from your authenticator app"}
        </Label>
        <Input
          id="code"
          name="code"
          key={useBackupCode ? "backup" : "totp"}
          inputMode={useBackupCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={useBackupCode ? undefined : "[0-9]*"}
          maxLength={useBackupCode ? 32 : 6}
          required
          autoFocus
          className={useBackupCode ? "h-10" : "h-10 font-mono tracking-[0.3em]"}
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Checking…" : "Verify"}
      </Button>
      <Button
        type="button"
        variant="link"
        onClick={() => {
          setUseBackupCode((value) => !value);
          setError("");
        }}
        className="w-full text-muted-foreground"
      >
        {useBackupCode
          ? "Use the authenticator app instead"
          : "Use a backup code instead"}
      </Button>
    </form>
  );
}
