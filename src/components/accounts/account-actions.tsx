"use client";

import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";

import {
  deleteAccountAction,
  deleteManualBalanceAction,
  setArchivedAction,
} from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";

import { ConfirmAction } from "./confirm-action";

/** Archive or restore; delete only for accounts with no recorded history. */
export function AccountLifecycleActions({
  accountId,
  name,
  archived,
  deletable,
}: {
  accountId: string;
  name: string;
  archived: boolean;
  deletable: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {archived ? (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveRestoreIcon aria-hidden />
              Restore
            </Button>
          }
          title={`Restore ${name}?`}
          description="It returns to your account lists and current totals."
          confirmLabel="Restore"
          pendingLabel="Restoring…"
          run={() => setArchivedAction(accountId, false)}
        />
      ) : (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveIcon aria-hidden />
              Archive
            </Button>
          }
          title={`Archive ${name}?`}
          description="Use this for a closed account. Its balance history is kept, but it's left out of current totals and Safe to Spend. You can restore it later."
          confirmLabel="Archive"
          pendingLabel="Archiving…"
          run={() => setArchivedAction(accountId, true)}
        />
      )}
      {deletable ? (
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-destructive">
              <Trash2Icon aria-hidden />
              Delete
            </Button>
          }
          title={`Delete ${name}?`}
          description="Nothing has been recorded for this account yet, so it can be deleted. This can't be undone."
          confirmLabel="Delete account"
          pendingLabel="Deleting…"
          destructive
          run={() => deleteAccountAction(accountId)}
        />
      ) : null}
    </div>
  );
}

/** Removes a manual balance entry (for typos). */
export function DeleteBalanceEntryButton({
  accountId,
  entryId,
  label,
}: {
  accountId: string;
  entryId: string;
  /** Describes the entry, e.g. "the Oct 3, 2026 balance". */
  label: string;
}) {
  return (
    <ConfirmAction
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${label}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon aria-hidden />
        </Button>
      }
      title="Remove this entry?"
      description={`This removes ${label}. Use it to fix a typo; the account's other history stays.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      destructive
      run={() => deleteManualBalanceAction(accountId, entryId)}
    />
  );
}
