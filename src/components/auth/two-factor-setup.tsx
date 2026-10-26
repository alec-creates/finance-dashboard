"use client";

import QRCode from "qrcode";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";
import { navigateWithFullReload } from "@/lib/navigation";

import { FormError } from "./auth-card";

interface Enrollment {
  qrDataUrl: string;
  manualKey: string;
  backupCodes: string[];
}

/**
 * Turns on TOTP 2FA: confirm the password, scan the QR code (or type the key), save the backup codes, then enter a
 * code to prove the app is set up. Secrets stay in this component's memory and are never sent anywhere else.
 */
export function TwoFactorSetup() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setPending(true);
    setError("");
    const { data, error: authError } = await authClient.twoFactor.enable({
      password,
    });
    if (authError || !data || !("totpURI" in data)) {
      setPending(false);
      setError(describeAuthError(authError, "enableTwoFactor"));
      return;
    }
    const manualKey = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setEnrollment({
      qrDataUrl: await QRCode.toDataURL(data.totpURI, {
        margin: 1,
        width: 220,
      }),
      manualKey: manualKey.replace(/(.{4})/g, "$1 ").trim(),
      backupCodes: data.backupCodes,
    });
    setPending(false);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).replace(/\s+/g, "");
    setPending(true);
    setError("");
    const { error: authError } = await authClient.twoFactor.verifyTotp({
      code,
    });
    if (authError) {
      setPending(false);
      setError(describeAuthError(authError, "twoFactor"));
      return;
    }
    setEnrollment(null); // drop secrets from memory
    navigateWithFullReload("/");
  }

  function downloadBackupCodes(codes: string[]) {
    const blob = new Blob(
      [
        `Finance Dashboard backup codes (each works once)\n\n${codes.join("\n")}\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "finance-dashboard-backup-codes.txt",
    });
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!enrollment) {
    return (
      <form onSubmit={start} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">Confirm your password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={pending} className="h-10 w-full">
          {pending ? "Preparing…" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          1. Add the account to your authenticator app
        </h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimize */}
        <img
          src={enrollment.qrDataUrl}
          alt="QR code for your authenticator app"
          width={220}
          height={220}
          className="rounded-lg bg-white p-2 ring-1 ring-foreground/10"
        />
        <p className="text-sm text-muted-foreground">
          Can&apos;t scan? Enter this key manually:
          <code className="mt-1 block rounded-md bg-muted px-2 py-1 font-mono text-xs break-all text-foreground">
            {enrollment.manualKey}
          </code>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">2. Save your backup codes</h2>
        <p className="text-sm text-muted-foreground">
          Each code signs you in once if you lose your phone. They won&apos;t be
          shown again. Store them in a password manager.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadBackupCodes(enrollment.backupCodes)}
        >
          Download as a text file
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(event) => setSavedCodes(event.target.checked)}
            className="size-4 accent-primary"
          />
          I&apos;ve saved my backup codes
        </label>
      </section>

      <form onSubmit={confirm} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="code" className="text-sm font-semibold">
            3. Enter the 6-digit code from the app
          </Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="h-10 font-mono tracking-[0.3em]"
          />
        </div>
        <FormError message={error} />
        <Button
          type="submit"
          disabled={pending || !savedCodes}
          className="h-10 w-full"
        >
          {pending ? "Checking…" : "Turn on two-factor authentication"}
        </Button>
      </form>
    </div>
  );
}
