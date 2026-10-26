"use client";

import { useRouter } from "next/navigation";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

/** Filters the list by account; navigates at once, keeping the month. */
export function AccountFilter({
  month,
  accountId,
  accounts,
}: {
  month: string;
  accountId: string;
  accounts: { id: string; name: string; archived: boolean }[];
}) {
  const router = useRouter();
  return (
    <NativeSelect
      aria-label="Account"
      value={accountId}
      onChange={(event) => {
        const params = new URLSearchParams({ month });
        if (event.target.value) {
          params.set("account", event.target.value);
        }
        router.push(`/transactions?${params}`);
      }}
      className="w-full sm:w-56"
    >
      <NativeSelectOption value="">All accounts</NativeSelectOption>
      {accounts.map((account) => (
        <NativeSelectOption key={account.id} value={account.id}>
          {account.name}
          {account.archived ? " (archived)" : ""}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
