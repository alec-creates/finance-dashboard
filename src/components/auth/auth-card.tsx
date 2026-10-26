import { CircleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/app-shell/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Full-page frame for sign-in, two-factor and setup: brand, theme toggle and a centered card. */
export function AuthCard({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  /** Wider card for the 2FA setup steps. */
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-muted/40">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Brand asLink={false} />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
        <Card className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
          <CardHeader>
            <CardTitle className="text-lg">
              <h1>{title}</h1>
            </CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Loading state for auth pages that check the database first. */
export function AuthPageSkeleton() {
  return (
    <div
      className="flex min-h-dvh flex-1 items-center justify-center bg-muted/40 px-4"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-72 w-full max-w-sm rounded-xl" />
    </div>
  );
}
