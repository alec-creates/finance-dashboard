"use client";

import type { ReactNode } from "react";

import { deleteTransactionAction } from "@/app/(app)/transactions/actions";
import { ConfirmAction } from "@/components/accounts/confirm-action";

export function DeleteTransactionButton({
  transactionId,
  description,
  trigger,
}: {
  transactionId: string;
  description: string;
  trigger: ReactNode;
}) {
  return (
    <ConfirmAction
      trigger={trigger}
      title="Delete this transaction?"
      description={`"${description}" and its category splits will be removed. Account balances you recorded are not changed. This can't be undone.`}
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      destructive
      run={() => deleteTransactionAction(transactionId)}
    />
  );
}
