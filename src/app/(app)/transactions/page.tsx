import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  ReceiptTextIcon,
  TagsIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { AccountFilter } from "@/components/transactions/account-filter";
import { Badge } from "@/components/ui/badge";
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
  addMonthsToYearMonth,
  formatCalendarDate,
  parseCalendarDate,
  parseYearMonth,
  todayInTimeZone,
  yearMonthOf,
  type YearMonth,
} from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import {
  countsAsIncome,
  countsAsSpending,
  KIND_RULES,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { listAccountsWithBalances } from "@/server/services/accounts";
import {
  getUserTimeZone,
  listTransactions,
  type TransactionRow,
} from "@/server/services/transactions";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage({
  searchParams,
}: PageProps<"/transactions">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <TransactionsView searchParams={searchParams} />
    </Suspense>
  );
}

function monthLabel(month: YearMonth): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function readMonth(value: unknown, fallback: YearMonth): YearMonth {
  if (typeof value !== "string") {
    return fallback;
  }
  try {
    return parseYearMonth(value);
  } catch {
    return fallback;
  }
}

async function TransactionsView({
  searchParams,
}: {
  searchParams: PageProps<"/transactions">["searchParams"];
}) {
  const params = await searchParams;
  const user = await requireUser();
  const prisma = getPrisma();
  const [accounts, timeZone] = await Promise.all([
    listAccountsWithBalances(prisma, user.id),
    getUserTimeZone(prisma, user.id),
  ]);
  const thisMonth = yearMonthOf(todayInTimeZone(timeZone));
  const month = readMonth(params.month, thisMonth);
  // An account id that isn't the owner's is ignored rather than trusted.
  const accountId =
    typeof params.account === "string" &&
    accounts.some((account) => account.id === params.account)
      ? params.account
      : "";
  const openAccounts = accounts.filter((account) => !account.archivedAt);

  const header = (
    <PageHeader
      title="Transactions"
      description="Totals count income and spending by kind. Transfers and card payments never count twice."
      actions={
        openAccounts.length > 0 ? (
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-9">
              <Link href="/settings/categories">
                <TagsIcon aria-hidden />
                Categories
              </Link>
            </Button>
            <Button asChild className="h-9">
              <Link
                href={`/transactions/new${accountId ? `?account=${accountId}` : ""}`}
              >
                <PlusIcon aria-hidden />
                Add
              </Link>
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (accounts.length === 0) {
    return (
      <>
        {header}
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>
              <h2>Add an account first</h2>
            </CardTitle>
            <CardDescription>
              Every transaction belongs to an account, such as a checking
              account or a credit card.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/accounts/new">
                <PlusIcon aria-hidden />
                Add account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const { rows, totals } = await listTransactions(prisma, user.id, {
    month,
    ...(accountId ? { accountId } : {}),
  });
  const link = (target: YearMonth) => {
    const query = new URLSearchParams({ month: target });
    if (accountId) {
      query.set("account", accountId);
    }
    return `/transactions?${query}`;
  };
  const byDate = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  }

  return (
    <>
      {header}
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Month" className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link
                href={link(addMonthsToYearMonth(month, -1))}
                aria-label="Previous month"
              >
                <ChevronLeftIcon aria-hidden />
              </Link>
            </Button>
            <h2
              className="min-w-36 text-center font-heading text-lg font-semibold"
              aria-live="polite"
            >
              {monthLabel(month)}
            </h2>
            <Button asChild variant="ghost" size="icon">
              <Link
                href={link(addMonthsToYearMonth(month, 1))}
                aria-label="Next month"
              >
                <ChevronRightIcon aria-hidden />
              </Link>
            </Button>
            {month !== thisMonth ? (
              <Button asChild variant="link" size="sm">
                <Link href={link(thisMonth)}>This month</Link>
              </Button>
            ) : null}
          </nav>
          <AccountFilter
            month={month}
            accountId={accountId}
            accounts={accounts.map((account) => ({
              id: account.id,
              name: account.name,
              archived: account.archivedAt !== null,
            }))}
          />
        </div>

        <dl className="grid gap-2 sm:grid-cols-3 sm:gap-4">
          <Total label="Income" cents={totals.incomeCents} />
          <Total label="Spending" cents={totals.spendingCents} />
          <Total label="Net" cents={totals.netCents} signed />
        </dl>
        {totals.excludedCount > 0 ? (
          <p className="-mt-3 text-xs text-muted-foreground">
            {totals.excludedCount} transfer
            {totals.excludedCount === 1 ? "" : "s"}, payment
            {totals.excludedCount === 1 ? "" : "s"} or adjustment
            {totals.excludedCount === 1 ? " is" : "s are"} listed but not
            counted.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <Card>
            <CardHeader className="items-center text-center">
              <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                <ReceiptTextIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
              </span>
              <CardTitle>
                <h2>No transactions in {monthLabel(month)}</h2>
              </CardTitle>
              <CardDescription>
                {accountId
                  ? "Nothing recorded for this account this month."
                  : "Add one by hand. Importing from your bank comes later."}
              </CardDescription>
            </CardHeader>
            {openAccounts.length > 0 ? (
              <CardContent className="flex justify-center">
                <Button asChild>
                  <Link
                    href={`/transactions/new${accountId ? `?account=${accountId}` : ""}`}
                  >
                    <PlusIcon aria-hidden />
                    Add transaction
                  </Link>
                </Button>
              </CardContent>
            ) : null}
          </Card>
        ) : (
          <div className="space-y-4">
            {[...byDate].map(([date, dayRows]) => (
              <section key={date} aria-labelledby={`day-${date}`}>
                <h3
                  id={`day-${date}`}
                  className="mb-1.5 px-1 text-xs font-medium text-muted-foreground"
                >
                  {formatCalendarDate(parseCalendarDate(date), "long")}
                </h3>
                <Card className="gap-0 py-0">
                  <ul className="divide-y">
                    {dayRows.map((row) => (
                      <TransactionItem
                        key={row.id}
                        row={row}
                        showAccount={!accountId}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Total({
  label,
  cents,
  signed = false,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl px-4 py-2.5 ring-1 ring-foreground/10 sm:block sm:py-3">
      <dt className="text-sm text-muted-foreground sm:text-xs">{label}</dt>
      <dd className="text-base font-semibold tabular-nums sm:mt-1 sm:text-xl">
        {formatUsd(cents, {
          showCents: true,
          signDisplay: signed ? "exceptZero" : "auto",
        })}
      </dd>
    </div>
  );
}

function categorySummary(row: TransactionRow): string {
  const rule = KIND_RULES[row.kind];
  if (rule.categoryType === null) {
    return rule.label;
  }
  if (row.splits.length > 1) {
    return `Split across ${row.splits.length} categories`;
  }
  const category = row.splits[0]?.category;
  if (!category) {
    return "Uncategorized";
  }
  return category.parentName
    ? `${category.parentName} › ${category.name}`
    : category.name;
}

function TransactionItem({
  row,
  showAccount,
}: {
  row: TransactionRow;
  showAccount: boolean;
}) {
  const counted = countsAsIncome(row.kind) || countsAsSpending(row.kind);
  const content = (
    <>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-medium">{row.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[showAccount ? row.account.name : null, categorySummary(row)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-medium tabular-nums",
            row.amountCents > 0 &&
              counted &&
              "text-emerald-700 dark:text-emerald-400",
            !counted && "text-muted-foreground",
          )}
        >
          {formatUsd(row.amountCents, { signDisplay: "exceptZero" })}
        </p>
        {row.kind === "REFUND" ? (
          <Badge variant="secondary">Refund</Badge>
        ) : !counted ? (
          <Badge variant="outline">Not counted</Badge>
        ) : null}
      </div>
    </>
  );
  const classes = "flex items-center gap-3 px-4 py-3 text-sm";
  return (
    <li>
      {row.manual && !row.account.archived ? (
        <Link
          href={`/transactions/${row.id}/edit`}
          className={cn(
            classes,
            "outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
          )}
        >
          {content}
        </Link>
      ) : (
        <div className={classes}>{content}</div>
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
