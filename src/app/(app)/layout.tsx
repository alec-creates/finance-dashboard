import { Suspense, type ReactNode } from "react";

import { Brand } from "@/components/app-shell/brand";
import { MobileTabBar, SidebarNav } from "@/components/app-shell/main-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

/**
 * The signed-in app: a sidebar on desktop, a header and bottom tab bar on phones. The frame holds no user data, so it
 * is prerendered; everything inside `main` waits for a valid session with 2FA (each page also checks on its own).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-background px-4 py-2.5 text-sm font-medium shadow-lg ring-3 ring-ring/50 transition-transform outline-none focus:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="flex items-center justify-between gap-2 px-1">
          <Brand />
          <ThemeToggle />
        </div>
        <SidebarNav />
        <div className="mt-auto border-t pt-4">
          <Suspense fallback={<Skeleton className="h-11 w-full" />}>
            <SignedInUser />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <SignedInUser compact />
            </Suspense>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none md:px-8 md:py-10"
        >
          <Suspense fallback={<PageSkeleton />}>
            <RequireSignedIn>{children}</RequireSignedIn>
          </Suspense>
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

async function RequireSignedIn({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}

async function SignedInUser({ compact = false }: { compact?: boolean }) {
  const user = await requireUser();
  return <UserMenu name={user.name} email={user.email} compact={compact} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full max-w-2xl" />
    </div>
  );
}
