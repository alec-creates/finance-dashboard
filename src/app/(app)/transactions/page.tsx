import { ArrowLeftRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every cash transaction across your accounts."
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
      icon={ArrowLeftRightIcon}
      title="Transactions are on the way"
      description="Manual entry comes first, then CSV imports from your bank and card."
      roadmap="Tasks 7 and 9"
      planned={[
        "Browse by month and account, with income and spending totals by kind",
        "Add or edit transactions and split them across categories",
        "Import bank and credit card CSVs with a preview and duplicate detection",
      ]}
    />
  );
}
