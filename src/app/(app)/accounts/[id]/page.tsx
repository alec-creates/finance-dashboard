import { ArchiveIcon, ChevronLeftIcon, PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  AccountLifecycleActions,
  DeleteBalanceEntryButton,
} from "@/components/accounts/account-actions";
import { accountSubtitle } from "@/components/accounts/account-row";
import { BalanceAmount } from "@/components/accounts/balance-amount";
import { BalanceForm } from "@/components/accounts/balance-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  accountTypeLabel,
  SNAPSHOT_SOURCE_LABELS,
  supportsSafeToSpend,
} from "@/lib/accounts";
import { formatCalendarDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import {
  currentAmountCents,
  getAccountDetail,
  type AccountDetail,
} from "@/server/services/accounts";

import { recordBalanceAction } from "../actions";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage({ params }: PageProps<"/accounts/[id]">) {
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
      <Suspense fallback={<DetailSkeleton />}>
        <AccountView params={params} />
      </Suspense>
    </>
  );
}

async function AccountView({
  params,
}: {
  params: PageProps<"/accounts/[id]">["params"];
}) {
  const { id } = await params;
  const user = await requireUser();
  const account = await getAccountDetail(getPrisma(), user.id, id);
  if (!account) {
    notFound();
  }
  const archived = account.archivedAt !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">
            {account.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {accountSubtitle(account)}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {archived ? <Badge variant="outline">Archived</Badge> : null}
            {account.includeInSafeToSpend && !archived ? (
              <Badge variant="secondary">Safe to Spend</Badge>
            ) : null}
            {!account.includeInNetWorth ? (
              <Badge variant="outline">Not in net worth</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {archived ? null : (
            <Button asChild variant="outline">
              <Link href={`/accounts/${account.id}/edit`}>
                <PencilIcon aria-hidden />
                Edit
              </Link>
            </Button>
          )}
          <AccountLifecycleActions
            accountId={account.id}
            name={account.name}
            archived={archived}
            deletable={!account.hasHistory}
          />
        </div>
      </div>

      {archived ? (
        <Alert>
          <ArchiveIcon aria-hidden />
          <AlertDescription>
            This account is archived. Its history is kept, but it&apos;s left
            out of current totals and Safe to Spend. Restore it to make changes.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CurrentBalanceCard account={account} />
          {archived ? null : (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Update balance</h2>
                </CardTitle>
                <CardDescription>
                  {account.type === "INVESTMENT"
                    ? "Record the account's total value on a date. Values are never estimated between entries."
                    : "Record the balance shown by your bank or card on a date."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BalanceForm
                  type={account.type}
                  action={recordBalanceAction.bind(null, account.id)}
                  manualEntries={Object.fromEntries(
                    account.history
                      .filter((entry) => entry.source === "MANUAL")
                      .map((entry) => [entry.asOfDate, entry.amountCents]),
                  )}
                />
              </CardContent>
            </Card>
          )}
          <HistoryCard account={account} archived={archived} />
        </div>
        <DetailsCard account={account} />
      </div>
    </div>
  );
}

function CurrentBalanceCard({ account }: { account: AccountDetail }) {
  const current = account.current;
  const label =
    account.type === "INVESTMENT" ? "Current value" : "Current balance";
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {current ? (
          <CardTitle className="text-3xl font-semibold tracking-tight">
            <BalanceAmount
              type={account.type}
              cents={currentAmountCents(current)}
            />
          </CardTitle>
        ) : (
          <CardTitle className="text-lg">
            {account.type === "INVESTMENT" ? "No value yet" : "No balance yet"}
          </CardTitle>
        )}
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {current ? (
          <>
            <p>
              As of {formatCalendarDate(current.asOfDate, "long")} ·{" "}
              {SNAPSHOT_SOURCE_LABELS[current.source]}
            </p>
            {current.storage === "valuation" ? (
              <p>
                Holdings {formatUsd(current.marketValueCents)} · Cash{" "}
                {formatUsd(current.cashCents)}
              </p>
            ) : current.availableCents !== null ? (
              <p>Available {formatUsd(current.availableCents)}</p>
            ) : null}
          </>
        ) : (
          <p>
            {account.archivedAt
              ? "No balance was recorded before it was archived."
              : "Add one below. Until then, this account is left out of totals."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({
  account,
  archived,
}: {
  account: AccountDetail;
  archived: boolean;
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle>
          <h2>Balance history</h2>
        </CardTitle>
        {account.historyTotal > account.history.length ? (
          <CardDescription>
            Latest {account.history.length} of {account.historyTotal} entries.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        {account.history.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {account.history.map((entry) => {
              const date = formatCalendarDate(entry.asOfDate);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="w-28 shrink-0 tabular-nums">{date}</span>
                  <span className="min-w-0 flex-1 text-right">
                    <BalanceAmount
                      type={account.type}
                      cents={entry.amountCents}
                    />
                    {entry.cashCents !== null && entry.cashCents > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        incl. {formatUsd(entry.cashCents)} cash
                      </span>
                    ) : null}
                  </span>
                  <Badge variant="outline" className="w-20 justify-center">
                    {SNAPSHOT_SOURCE_LABELS[entry.source]}
                  </Badge>
                  <span className="flex w-7 justify-end">
                    {entry.source === "MANUAL" && !archived ? (
                      <DeleteBalanceEntryButton
                        accountId={account.id}
                        entryId={entry.id}
                        label={`the ${date} entry`}
                      />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsCard({ account }: { account: AccountDetail }) {
  const rows: [string, string][] = [
    ["Type", accountTypeLabel(account.type, account.investmentType)],
    ["Institution", account.institutionName ?? "—"],
    ["Last digits", account.mask ? `••${account.mask}` : "—"],
    ["Net worth", account.includeInNetWorth ? "Included" : "Not included"],
  ];
  if (supportsSafeToSpend(account.type)) {
    rows.push(
      [
        "Safe to Spend",
        account.includeInSafeToSpend ? "Counts as spendable" : "Not spendable",
      ],
      [
        "Minimum balance",
        account.minimumBalanceCents !== null
          ? formatUsd(account.minimumBalanceCents)
          : "None",
      ],
    );
  }
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <h2>Details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          {rows.map(([term, description]) => (
            <div key={term} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-right font-medium">{description}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
