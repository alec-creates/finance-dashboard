import { PiggyBankIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly spending limits by category."
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
      icon={PiggyBankIcon}
      title="Budgets are on the way"
      description="Set a monthly amount per category and see how much is left."
      roadmap="Task 11"
      planned={[
        "A budget per category for each month, copied forward",
        "Progress that turns yellow, then red, as you approach the limit",
        "Refunds reduce spending; transfers and card payments never count",
      ]}
    />
  );
}
