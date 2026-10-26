"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";

export function RevokeOtherSessionsButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || pending}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        onClick={async () => {
          setPending(true);
          const { error } = await authClient.revokeOtherSessions();
          setPending(false);
          setMessage(
            error
              ? describeAuthError(error)
              : "Signed out of all other devices.",
          );
          router.refresh();
        }}
      >
        {pending
          ? "Signing out other devices…"
          : "Sign out of all other devices"}
      </button>
      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
