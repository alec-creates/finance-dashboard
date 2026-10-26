"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";
import { navigateWithFullReload } from "@/lib/navigation";
import {
  MIN_PASSWORD_LENGTH,
  TWO_FACTOR_SETUP_PATH,
} from "@/server/auth/constants";

import { FormError } from "./auth-card";

/** One-time creation of the owner account. The server accepts only the configured owner email. */
export function SetupForm() {
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
    navigateWithFullReload(TWO_FACTOR_SETUP_PATH);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Owner email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className="h-10"
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters. A passphrase from a
          password manager works well.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="h-10"
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? "Creating account…" : "Create owner account"}
      </Button>
    </form>
  );
}
