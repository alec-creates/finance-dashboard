"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-messages";

export function RevokeOtherSessionsButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
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
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
