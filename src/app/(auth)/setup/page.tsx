import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { SetupForm } from "@/components/auth/setup-form";
import { ownerAccountExists } from "@/server/auth/config";
import { getPrisma } from "@/server/db/client";

export const metadata: Metadata = { title: "Set up · Finance Dashboard" };

export default function SetupPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading…</p>}>
      <SetupGate />
    </Suspense>
  );
}

async function SetupGate() {
  await connection(); // checked on every request, never prerendered
  const ownerExists = await ownerAccountExists(getPrisma());
  if (ownerExists) {
    return (
      <AuthCard title="Setup is complete">
        <Link
          href="/sign-in"
          className="text-sm font-medium underline underline-offset-4"
        >
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Create the owner account"
      description="This works once, and only with the owner email configured on the server. You'll set up two-factor authentication next."
    >
      <SetupForm />
    </AuthCard>
  );
}
