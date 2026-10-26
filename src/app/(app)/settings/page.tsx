import { ChevronRightIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ThemeOptions } from "@/components/theme/theme-options";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-2xl" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await requireUser();
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            System follows your device. Saved in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeOptions />
        </CardContent>
      </Card>

      <Card className="py-0">
        <Link
          href="/settings/security"
          className="flex items-center gap-4 px-4 py-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldCheckIcon
              className="size-5 text-muted-foreground"
              aria-hidden
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Security</span>
            <span className="block text-sm text-muted-foreground">
              Two-factor authentication and signed-in devices
            </span>
          </span>
          <ChevronRightIcon className="text-muted-foreground" aria-hidden />
        </Link>
      </Card>
    </div>
  );
}
