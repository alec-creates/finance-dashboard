import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthCard, AuthPageSkeleton } from "@/components/auth/auth-card";
import { SetupForm } from "@/components/auth/setup-form";
import { Button } from "@/components/ui/button";
import { ownerAccountExists } from "@/server/auth/config";
import { getPrisma } from "@/server/db/client";

export const metadata: Metadata = { title: "Set up" };

export default function SetupPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
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
        <Button asChild className="h-10 w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
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
