"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { ActionState } from "@/app/(app)/accounts/actions";
import { FormError } from "@/components/auth/auth-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * A button that asks for confirmation, then runs a Server Action. The dialog stays open (with the message) if the
 * action reports a problem, and closes when it succeeds.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  run,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  run: () => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={(event) => {
              event.preventDefault(); // close only after the action succeeds
              startTransition(async () => {
                const result = await run();
                if (result.status === "error") {
                  setError(result.formError ?? "Something went wrong.");
                } else {
                  setOpen(false);
                }
              });
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
