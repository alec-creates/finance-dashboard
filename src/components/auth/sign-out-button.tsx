"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { navigateWithFullReload } from "@/lib/navigation";

/**
 * Ends this session on the server (the session row is deleted), then fully reloads into sign-in so no page that was
 * shown while signed in stays in memory.
 */
export function useSignOut() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
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
  }
  return { signOut, pending, failed };
}

export function SignOutButton({
  variant = "outline",
}: {
  variant?: "outline" | "ghost";
}) {
  const { signOut, pending, failed } = useSignOut();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={signOut}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {failed ? (
        <span role="alert" className="text-xs text-destructive">
          Sign-out failed. Try again.
        </span>
      ) : null}
    </span>
  );
}
