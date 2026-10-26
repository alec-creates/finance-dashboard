import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { accountTypeLabel } from "@/lib/accounts";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  currentAmountCents,
  type AccountSummary,
} from "@/server/services/accounts";

import { BalanceAmount } from "./balance-amount";

/** Secondary line: kind, institution and last digits, whichever are known. */
export function accountSubtitle(account: {
  type: AccountSummary["type"];
  investmentType: AccountSummary["investmentType"];
  institutionName: string | null;
  mask: string | null;
}): string {
  return [
    accountTypeLabel(account.type, account.investmentType),
    account.institutionName,
    account.mask ? `••${account.mask}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AccountRow({ account }: { account: AccountSummary }) {
  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className={cn(
          "flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
          account.archivedAt && "text-muted-foreground",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium">{account.name}</span>
            {account.includeInSafeToSpend && !account.archivedAt ? (
              <Badge variant="secondary">Safe to Spend</Badge>
            ) : null}
            {!account.includeInNetWorth ? (
              <Badge variant="outline">Not in net worth</Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {accountSubtitle(account)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {account.current ? (
            <>
              <BalanceAmount
                type={account.type}
                cents={currentAmountCents(account.current)}
                className="block font-medium"
              />
              <span className="text-xs text-muted-foreground">
                as of {formatCalendarDate(account.current.asOfDate)}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              No balance yet
            </span>
          )}
        </div>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}
