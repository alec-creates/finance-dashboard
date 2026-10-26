import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Set up two-factor authentication · Finance Dashboard",
};

/** Required before anything else: signed in, but 2FA not yet on. */
export default function TwoFactorSetupPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading…</p>}>
      <SetupGate />
    </Suspense>
  );
}

async function SetupGate() {
  const user = await requireUser({ allowWithoutTwoFactor: true });
  if (user.twoFactorEnabled) {
    redirect("/");
  }
  return (
    <AuthCard
      title="Set up two-factor authentication"
      description="Required to protect your financial data. You'll need an authenticator app such as 1Password, Bitwarden, Google Authenticator or Microsoft Authenticator."
    >
      <TwoFactorSetup />
      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
