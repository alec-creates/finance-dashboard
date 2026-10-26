import { headers } from "next/headers";
import { Suspense } from "react";

import { RevokeOtherSessionsButton } from "@/components/auth/revoke-other-sessions-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getAuth } from "@/server/auth";
import { requireUser } from "@/server/auth/session";

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
      <Suspense
        fallback={<p className="text-sm text-zinc-500">Loading sessions…</p>}
      >
        <SecurityOverview />
      </Suspense>
    </div>
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
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {user.twoFactorEnabled
            ? "On. Sign-in requires a code from your authenticator app or a backup code."
            : "Off."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Signed-in devices</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span>
                {row.device}
                {row.isCurrent ? (
                  <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                    This device
                  </span>
                ) : null}
              </span>
              <span className="text-zinc-500">
                Signed in{" "}
                {row.createdAt.toLocaleDateString("en-US", {
                  dateStyle: "medium",
                })}
              </span>
            </li>
          ))}
        </ul>
        <RevokeOtherSessionsButton disabled={rows.length <= 1} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <SignOutButton className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900" />
      </section>
    </div>
  );
}
