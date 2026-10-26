"use client";

import { ChevronsUpDownIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { useSignOut } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/**
 * Signed-in user, with links to security settings and sign-out. `compact` shows only the avatar (mobile header);
 * otherwise the name too (desktop sidebar).
 */
export function UserMenu({
  name,
  email,
  compact = false,
}: {
  name: string;
  email: string;
  compact?: boolean;
}) {
  const { signOut, pending, failed } = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "lg"}
          className={cn(
            !compact && "h-auto w-full justify-start gap-3 px-2 py-1.5",
          )}
          aria-label={compact ? `Account menu for ${name}` : undefined}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
            aria-hidden
          >
            {initials(name)}
          </span>
          {compact ? null : (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">
                  {name}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              </span>
              <ChevronsUpDownIcon
                className="text-muted-foreground"
                aria-hidden
              />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="block truncate text-xs">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/security">
            <ShieldCheckIcon aria-hidden />
            Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault(); // keep the menu open to show progress or an error
            void signOut();
          }}
        >
          <LogOutIcon aria-hidden />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {failed ? (
          <p role="alert" className="px-1.5 py-1 text-xs text-destructive">
            Sign-out failed. Try again.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
