import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCOUNT_TYPES,
  supportsSafeToSpend,
  type AccountType,
} from "@/lib/accounts";
import { centsToDecimalString } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { getAccountDetail } from "@/server/services/accounts";

import { updateAccountAction } from "../../actions";

export const metadata: Metadata = { title: "Edit account" };

export default function EditAccountPage({
  params,
}: PageProps<"/accounts/[id]/edit">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-2xl" />}>
      <EditAccount params={params} />
    </Suspense>
  );
}

async function EditAccount({
  params,
}: {
  params: PageProps<"/accounts/[id]/edit">["params"];
}) {
  const { id } = await params;
  const user = await requireUser();
  const account = await getAccountDetail(getPrisma(), user.id, id);
  if (!account) {
    notFound();
  }
  const back = (
    <Button
      variant="ghost"
      size="sm"
      asChild
      className="mb-2 -ml-2 text-muted-foreground"
    >
      <Link href={`/accounts/${account.id}`}>
        <ChevronLeftIcon aria-hidden />
        {account.name}
      </Link>
    </Button>
  );

  if (account.archivedAt) {
    return (
      <>
        {back}
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>
              <h1>This account is archived</h1>
            </CardTitle>
            <CardDescription>
              Restore it from its page before making changes.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  // Once history exists, the type may only move between checking, savings and cash (see canChangeAccountType).
  const allowedTypes: readonly AccountType[] | undefined = account.hasHistory
    ? supportsSafeToSpend(account.type)
      ? ACCOUNT_TYPES.filter(supportsSafeToSpend)
      : [account.type]
    : undefined;

  return (
    <>
      {back}
      <PageHeader title="Edit account" />
      <Card className="max-w-2xl">
        <CardContent>
          <AccountForm
            action={updateAccountAction.bind(null, account.id)}
            defaults={{
              name: account.name,
              type: account.type,
              investmentType: account.investmentType ?? "",
              institutionName: account.institutionName ?? "",
              mask: account.mask ?? "",
              includeInNetWorth: account.includeInNetWorth,
              includeInSafeToSpend: account.includeInSafeToSpend,
              minimumBalance:
                account.minimumBalanceCents !== null
                  ? centsToDecimalString(account.minimumBalanceCents)
                  : "",
            }}
            allowedTypes={allowedTypes}
            lockedInvestmentType={
              account.hasHistory && account.type === "INVESTMENT"
            }
            submitLabel="Save changes"
            cancelHref={`/accounts/${account.id}`}
          />
        </CardContent>
      </Card>
    </>
  );
}
