import { LayoutDashboardIcon } from "lucide-react";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { listAccounts } from "@/server/services/accounts";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Where your money stands this month."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-2xl" />}>
        <AccountList />
      </Suspense>
    </>
  );
}

async function AccountList() {
  // Every data read starts from the authenticated user; userId never comes from the request.
  const user = await requireUser();
  const accounts = await listAccounts(getPrisma(), user.id);
  if (accounts.length === 0) {
    return (
      <ComingSoon
        icon={LayoutDashboardIcon}
        title="Your overview will appear here"
        description="Once accounts and transactions exist, this page summarizes them."
        roadmap="Task 12"
        planned={[
          "Cash and credit card balances",
          "This month's income and spending",
          "Budget progress and transactions waiting for review",
        ]}
      />
    );
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y border-t">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="truncate font-medium">{account.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {account.institutionName ?? account.type}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
