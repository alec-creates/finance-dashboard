import { describeBalance, type AccountType } from "@/lib/accounts";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A stored balance as people read it: assets as a plain amount (negative when overdrawn), liabilities as an amount
 * owed or a credit, never as a negative asset.
 */
export function BalanceAmount({
  type,
  cents,
  className,
}: {
  type: AccountType;
  cents: number;
  className?: string;
}) {
  const balance = describeBalance(type, cents);
  const amount = (value: number, extra?: string) => (
    <span className={cn("tabular-nums", extra)}>{formatUsd(value)}</span>
  );
  switch (balance.kind) {
    case "asset":
      return (
        <span className={className}>
          {amount(
            balance.amountCents,
            balance.amountCents < 0 ? "text-destructive" : undefined,
          )}
        </span>
      );
    case "owed":
      return (
        <span className={className}>
          {amount(balance.amountCents)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            owed
          </span>
        </span>
      );
    case "credit":
      return (
        <span className={className}>
          {amount(balance.amountCents)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            credit
          </span>
        </span>
      );
    case "settled":
      return (
        <span className={className}>
          {amount(0)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            owed
          </span>
        </span>
      );
  }
}
