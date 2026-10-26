import { Suspense } from "react";

import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import { listAccounts } from "@/server/services/accounts";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense
        fallback={<p className="text-sm text-zinc-500">Loading accounts…</p>}
      >
        <AccountList />
      </Suspense>
    </div>
  );
}

async function AccountList() {
  // Every data read starts from the authenticated user; userId never comes from the request.
  const user = await requireUser();
  const accounts = await listAccounts(getPrisma(), user.id);
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No accounts yet. Account management arrives in Phase 1 Task 6.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {accounts.map((account) => (
        <li
          key={account.id}
          className="flex items-center justify-between px-4 py-3 text-sm"
        >
          <span className="font-medium">{account.name}</span>
          <span className="text-zinc-500">
            {account.institutionName ?? account.type}
          </span>
        </li>
      ))}
    </ul>
  );
}
