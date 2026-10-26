import {
  ChartLineIcon,
  CreditCardIcon,
  LandmarkIcon,
  PlusIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AccountRow } from "@/components/accounts/account-row";
import { BalanceAmount } from "@/components/accounts/balance-amount";
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
  ACCOUNT_GROUPS,
  accountGroupOf,
  totalOfBalances,
} from "@/lib/accounts";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import {
  currentAmountCents,
  listAccountsWithBalances,
  type AccountSummary,
} from "@/server/services/accounts";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Accounts"
        description="Bank, credit card, investment and other accounts, with their latest balances."
        actions={
          <Button asChild className="h-9">
            <Link href="/accounts/new">
              <PlusIcon aria-hidden />
              Add account
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<AccountsSkeleton />}>
        <AccountsList />
      </Suspense>
    </div>
  );
}

async function AccountsList() {
  const user = await requireUser();
  const accounts = await listAccountsWithBalances(getPrisma(), user.id);
  const open = accounts.filter((account) => !account.archivedAt);
  const archived = accounts.filter((account) => account.archivedAt);

  if (accounts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          All your accounts are archived.
        </p>
      ) : null}
      {ACCOUNT_GROUPS.map((group) => {
        const members = open.filter(
          (account) => accountGroupOf(account.type) === group.id,
        );
        if (members.length === 0) {
          return null;
        }
        return (
          <GroupCard
            key={group.id}
            label={group.label}
            accounts={members}
            totalType={group.types[0]}
          />
        );
      })}

      {archived.length > 0 ? (
        <details className="group rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium outline-none select-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
            Archived accounts ({archived.length})
            <span className="block text-xs font-normal text-muted-foreground">
              History is kept; they&apos;re left out of current totals.
            </span>
          </summary>
          <ul className="divide-y border-t">
            {archived.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function GroupCard({
  label,
  accounts,
  totalType,
}: {
  label: string;
  accounts: AccountSummary[];
  totalType: AccountSummary["type"];
}) {
  const { totalCents, missing } = totalOfBalances(
    accounts.map((account) =>
      account.current ? currentAmountCents(account.current) : null,
    ),
  );
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-baseline justify-between gap-4 border-b py-3">
        <CardTitle>
          <h2>{label}</h2>
        </CardTitle>
        {accounts.length > 1 ? (
          <div className="text-right text-sm">
            <BalanceAmount
              type={totalType}
              cents={totalCents}
              className="font-medium"
            />
            {missing > 0 ? (
              <span className="block text-xs text-muted-foreground">
                {missing} without a balance
              </span>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const STARTER_KINDS = [
  {
    icon: WalletIcon,
    title: "Checking, savings and cash",
    text: "Money you hold. Can count toward Safe to Spend.",
  },
  {
    icon: CreditCardIcon,
    title: "Credit cards",
    text: "Tracked as an amount owed, never as available money.",
  },
  {
    icon: ChartLineIcon,
    title: "Investments",
    text: "Taxable brokerage, Traditional or Roth IRA, crypto exchange.",
  },
  {
    icon: LandmarkIcon,
    title: "Loans and other",
    text: "Other assets you own and debts you owe.",
  },
] as const;

function EmptyState() {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2>Add your first account</h2>
        </CardTitle>
        <CardDescription>
          Accounts hold your balances now, and your transactions and imports
          later. Add each one separately, including retirement accounts at the
          same broker.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {STARTER_KINDS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="space-y-0.5 text-sm">
                <span className="block font-medium">{title}</span>
                <span className="block text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button asChild className="h-10 w-full sm:w-auto">
          <Link href="/accounts/new">
            <PlusIcon aria-hidden />
            Add account
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AccountsSkeleton() {
  return (
    <div className="max-w-3xl space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
