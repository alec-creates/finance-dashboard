"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { navigateWithFullReload } from "@/lib/navigation";

/**
 * Ends this session on the server (the session row is deleted), then fully reloads into sign-in so no page that was
 * shown while signed in stays in memory.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={
          className ??
          "text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
        }
        onClick={async () => {
          setPending(true);
          setFailed(false);
          const { error } = await authClient.signOut();
          if (error) {
            // Still signed in: say so rather than pretending.
            setPending(false);
            setFailed(true);
            return;
          }
          navigateWithFullReload("/sign-in");
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {failed ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          Sign-out failed. Try again.
        </span>
      ) : null}
    </span>
  );
}
