import { LandmarkIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Bank, credit card and investment accounts."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-2xl" />}>
        <Placeholder />
      </Suspense>
    </>
  );
}

async function Placeholder() {
  await requireUser();
  return (
    <ComingSoon
      icon={LandmarkIcon}
      title="Account management is next"
      description="Add your accounts and keep their balances up to date."
      roadmap="Task 6"
      planned={[
        "Checking, savings, credit card, investment and other accounts",
        "Balance snapshots with the date they were last updated",
        "An optional minimum balance per account",
      ]}
    />
  );
}
