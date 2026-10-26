import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  AccountForm,
  NEW_ACCOUNT_DEFAULTS,
} from "@/components/accounts/account-form";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

import { createAccountAction } from "../actions";

export const metadata: Metadata = { title: "Add account" };

export default function NewAccountPage() {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-2 -ml-2 text-muted-foreground"
      >
        <Link href="/accounts">
          <ChevronLeftIcon aria-hidden />
          Accounts
        </Link>
      </Button>
      <PageHeader
        title="Add account"
        description="You can add a balance right after saving."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-2xl" />}>
        <NewAccountForm />
      </Suspense>
    </>
  );
}

async function NewAccountForm() {
  await requireUser();
  return (
    <Card className="max-w-2xl">
      <CardContent>
        <AccountForm
          action={createAccountAction}
          defaults={NEW_ACCOUNT_DEFAULTS}
          submitLabel="Add account"
          cancelHref="/accounts"
        />
      </CardContent>
    </Card>
  );
}
