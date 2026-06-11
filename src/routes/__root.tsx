import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
} from "@tanstack/react-router";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { RoleSwitcher } from "@/components/role-switcher";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Toaster } from "@/components/ui/sonner";
import { useActionItemsSync } from "@/hooks/use-action-items";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">העמוד לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          העמוד שחיפשת אינו קיים או הועבר.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            חזרה לדשבורד
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          העמוד לא נטען
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          משהו השתבש. ניתן לרענן או לחזור לדשבורד.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            נסה שוב
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            חזרה לדשבורד
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "ש.ב.א. — מערכת ניהול החזרות" },
      {
        name: "description",
        content:
          "מערכת ניהול תיקי החזרת ציוד ללקוחות — תיאום, מסמכים, חיפוש והשוואת כמויות.",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isExternal = pathname.startsWith("/c/");
  useActionItemsSync();

  // דפי לקוח חיצוני — ללא סיידבר/הדר פנימיים
  if (isExternal) {
    return (
      <>
        <HeadContent />
        <div className="min-h-screen w-full bg-muted/40 text-foreground">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" dir="rtl" />
      </>
    );
  }

  return (
    <>
      <HeadContent />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <ReadOnlyBanner />
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-4">
              <SidebarTrigger className="h-9 w-9" />
              <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                <h1 className="truncate text-sm font-semibold sm:text-base">
                  מערכת S.B.A. — ניהול החזרות לקוח
                </h1>
                <RoleSwitcher />
              </div>
            </header>
            <main className="flex-1 overflow-x-hidden p-3 sm:p-6">
              <Outlet />
            </main>
            <div className="pointer-events-none fixed bottom-2 left-2 z-40">
              <span className="rounded-md border border-border bg-card/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                נתוני דמה · מצב פיתוח
              </span>
            </div>
          </div>
        </div>
        <Toaster richColors position="top-center" dir="rtl" />
      </SidebarProvider>
    </>
  );
}
