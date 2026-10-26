import { ChevronLeftIcon, Trash2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { categoryOptions } from "@/components/transactions/category-options";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { absCents, centsToDecimalString } from "@/lib/money";
import { directionOf, KIND_RULES } from "@/lib/transactions";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { listAccountsWithBalances } from "@/server/services/accounts";
import {
  ensureStarterCategories,
  listCategoryTree,
} from "@/server/services/categories";
import { getTransaction } from "@/server/services/transactions";

import { updateTransactionAction } from "../../actions";

export const metadata: Metadata = { title: "Edit transaction" };

export default function EditTransactionPage({
  params,
}: PageProps<"/transactions/[id]/edit">) {
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
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-2xl" />}>
        <EditTransaction params={params} />
      </Suspense>
    </>
  );
}

async function EditTransaction({
  params,
}: {
  params: PageProps<"/transactions/[id]/edit">["params"];
}) {
  const { id } = await params;
  const user = await requireUser();
  const prisma = getPrisma();
  await ensureStarterCategories(prisma, user.id);
  const [transaction, accounts, tree] = await Promise.all([
    getTransaction(prisma, user.id, id),
    listAccountsWithBalances(prisma, user.id),
    listCategoryTree(prisma, user.id),
  ]);
  if (!transaction) {
    notFound();
  }
  if (!transaction.manual || transaction.account.archived) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1>This transaction can&apos;t be edited</h1>
          </CardTitle>
          <CardDescription>
            {transaction.manual
              ? "Its account is archived. Restore the account to change it."
              : "Imported transactions keep their original details."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const keep = new Set(
    transaction.splits.flatMap((split) =>
      split.category ? [split.category.id] : [],
    ),
  );
  const magnitude = (cents: number) => centsToDecimalString(absCents(cents));
  const split = transaction.splits.length > 1;

  return (
    <>
      <PageHeader
        title="Edit transaction"
        actions={
          <DeleteTransactionButton
            transactionId={transaction.id}
            description={transaction.description}
            trigger={
              <Button variant="ghost" className="text-destructive">
                <Trash2Icon aria-hidden />
                Delete
              </Button>
            }
          />
        }
      />
      <Card className="max-w-2xl">
        <CardContent>
          <TransactionForm
            action={updateTransactionAction.bind(null, transaction.id)}
            accounts={accounts
              .filter((account) => !account.archivedAt)
              .map(({ id: accountId, name }) => ({ id: accountId, name }))}
            categories={categoryOptions(tree, keep)}
            defaults={{
              accountId: transaction.account.id,
              date: transaction.date,
              description: transaction.description,
              kind: transaction.kind,
              direction:
                KIND_RULES[transaction.kind].direction === "either"
                  ? directionOf(transaction.amountCents)
                  : "",
              amount: magnitude(transaction.amountCents),
              notes: transaction.notes ?? "",
              splits: transaction.splits.map((entry) => ({
                category: entry.category?.id ?? "",
                // A single split takes the whole amount, so its own amount stays implicit.
                amount: split ? magnitude(entry.amountCents) : "",
              })),
            }}
            submitLabel="Save changes"
            cancelHref="/transactions"
          />
        </CardContent>
      </Card>
    </>
  );
}
