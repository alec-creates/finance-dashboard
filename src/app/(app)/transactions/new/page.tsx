import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { categoryOptions } from "@/components/transactions/category-options";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { listAccountsWithBalances } from "@/server/services/accounts";
import {
  ensureStarterCategories,
  listCategoryTree,
} from "@/server/services/categories";

import { createTransactionAction } from "../actions";

export const metadata: Metadata = { title: "Add transaction" };

export default function NewTransactionPage({
  searchParams,
}: PageProps<"/transactions/new">) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-2 -ml-2 text-muted-foreground"
      >
        <Link href="/transactions">
          <ChevronLeftIcon aria-hidden />
          Transactions
        </Link>
      </Button>
      <PageHeader title="Add transaction" />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-2xl" />}>
        <NewTransaction searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewTransaction({
  searchParams,
}: {
  searchParams: PageProps<"/transactions/new">["searchParams"];
}) {
  const params = await searchParams;
  const user = await requireUser();
  const prisma = getPrisma();
  await ensureStarterCategories(prisma, user.id);
  const [accounts, tree] = await Promise.all([
    listAccountsWithBalances(prisma, user.id),
    listCategoryTree(prisma, user.id),
  ]);
  const open = accounts.filter((account) => !account.archivedAt);
  if (open.length === 0) {
    redirect("/transactions");
  }
  const preselected =
    typeof params.account === "string" &&
    open.some((account) => account.id === params.account)
      ? params.account
      : open.length === 1
        ? (open[0]?.id ?? "")
        : "";

  return (
    <Card className="max-w-2xl">
      <CardContent>
        <TransactionForm
          action={createTransactionAction}
          accounts={open.map(({ id, name }) => ({ id, name }))}
          categories={categoryOptions(tree)}
          defaults={{
            accountId: preselected,
            date: "",
            description: "",
            kind: "EXPENSE",
            direction: "",
            amount: "",
            notes: "",
            splits: [],
          }}
          submitLabel="Add transaction"
          cancelHref="/transactions"
        />
      </CardContent>
    </Card>
  );
}
