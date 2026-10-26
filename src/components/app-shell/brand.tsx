import { WalletMinimalIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** App name with its mark. Links to the overview unless `asLink` is false (auth pages). */
export function Brand({
  asLink = true,
  className,
}: {
  asLink?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <WalletMinimalIcon className="size-4" aria-hidden />
      </span>
      <span className="font-heading text-[0.9375rem] font-semibold tracking-tight">
        Finance Dashboard
      </span>
    </>
  );
  const classes = cn("flex items-center gap-2.5", className);
  if (!asLink) {
    return <div className={classes}>{content}</div>;
  }
  return (
    <Link
      href="/"
      className={cn(
        classes,
        "rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {content}
    </Link>
  );
}
