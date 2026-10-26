import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { RevokeOtherSessionsButton } from "@/components/auth/revoke-other-sessions-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
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
import { getAuth } from "@/server/auth";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-2 -ml-2 text-muted-foreground"
      >
        <Link href="/settings">
          <ChevronLeftIcon aria-hidden />
          Settings
        </Link>
      </Button>
      <PageHeader title="Security" />
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-2xl" />}>
        <SecurityOverview />
      </Suspense>
    </>
  );
}

function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return "Unknown device";
  }
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}

async function SecurityOverview() {
  const user = await requireUser();
  const requestHeaders = await headers();
  const [current, sessions] = await Promise.all([
    getAuth().api.getSession({ headers: requestHeaders }),
    getAuth().api.listSessions({ headers: requestHeaders }),
  ]);
  // Only display-safe fields leave the server: never session tokens.
  const rows = sessions
    .map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      createdAt: new Date(session.createdAt),
      isCurrent: session.id === current?.session.id,
    }))
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            {user.twoFactorEnabled
              ? "On. Sign-in requires a code from your authenticator app or a backup code."
              : "Off."}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signed-in devices</CardTitle>
          <CardDescription>
            Sessions last 7 days and end at once when you sign out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5"
              >
                <span className="flex items-center gap-2 font-medium">
                  {row.device}
                  {row.isCurrent ? (
                    <Badge variant="secondary">This device</Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground">
                  Signed in{" "}
                  {row.createdAt.toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })}
                </span>
              </li>
            ))}
          </ul>
          <RevokeOtherSessionsButton disabled={rows.length <= 1} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>Ends the session on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
