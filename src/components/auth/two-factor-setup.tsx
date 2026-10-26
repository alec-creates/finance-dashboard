"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";

import { buttonClass, FormError, inputClass, labelClass } from "./auth-card";

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
  const router = useRouter();
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
    router.replace("/");
    router.refresh();
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
        <div>
          <label htmlFor="password" className={labelClass}>
            Confirm your password
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
          {pending ? "Preparing…" : "Continue"}
        </button>
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
          className="rounded-md bg-white p-2"
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Can&apos;t scan? Enter this key manually:
          <code className="mt-1 block rounded bg-zinc-100 px-2 py-1 font-mono text-xs break-all dark:bg-zinc-900">
            {enrollment.manualKey}
          </code>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">2. Save your backup codes</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Each code signs you in once if you lose your phone. They won&apos;t be
          shown again. Store them in a password manager.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-3 font-mono text-sm dark:bg-zinc-900">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => downloadBackupCodes(enrollment.backupCodes)}
          className="text-sm text-zinc-700 underline underline-offset-4 dark:text-zinc-300"
        >
          Download as a text file
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(event) => setSavedCodes(event.target.checked)}
          />
          I&apos;ve saved my backup codes
        </label>
      </section>

      <form onSubmit={confirm} className="space-y-4" noValidate>
        <h2 className="text-sm font-semibold">
          3. Enter the 6-digit code from the app
        </h2>
        <div>
          <label htmlFor="code" className="sr-only">
            Code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={inputClass}
          />
        </div>
        <FormError message={error} />
        <button
          type="submit"
          disabled={pending || !savedCodes}
          className={buttonClass}
        >
          {pending ? "Checking…" : "Turn on two-factor authentication"}
        </button>
      </form>
    </div>
  );
}
