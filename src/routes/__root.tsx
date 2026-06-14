import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
} from "@tanstack/react-router";
import { Loader2, LogOut } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { LoginPage } from "@/components/login-page";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useActionItemsSync } from "@/hooks/use-action-items";
import { useAuth } from "@/lib/auth-context";
import { SUPABASE_ENABLED } from "@/adapters";

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

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">טוען…</span>
      </div>
    </div>
  );
}

function InactiveAccount({
  onSignOut,
  noProfile,
}: {
  onSignOut: () => void;
  noProfile?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">
          {noProfile ? "אין פרופיל עובד" : "החשבון אינו פעיל"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {noProfile
            ? "המשתמש מאומת אך אין לו פרופיל עובד פעיל במערכת. פנה למנהל המערכת."
            : "החשבון שלך טרם הופעל. פנה למנהל המערכת להפעלה."}
        </p>
        <Button variant="outline" className="mt-4 gap-1" onClick={onSignOut}>
          <LogOut className="h-4 w-4" />
          יציאה
        </Button>
      </div>
    </div>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isExternal = pathname.startsWith("/c/");
  const { authEnabled, loading, session, profile, signOut } = useAuth();

  let content: React.ReactNode;
  if (isExternal) {
    // דפי לקוח חיצוני — ללא Auth פנימי (כניסה דרך טוקן חד-פעמי)
    content = (
      <div className="min-h-screen w-full bg-muted/40 text-foreground">
        <Outlet />
      </div>
    );
  } else if (authEnabled && loading) {
    content = <FullScreenLoader />;
  } else if (authEnabled && !session) {
    content = <LoginPage />;
  } else if (authEnabled && session && (!profile || !profile.is_active)) {
    content = <InactiveAccount onSignOut={signOut} noProfile={!profile} />;
  } else {
    // מאומת+פעיל, או מצב mock (ללא Auth)
    content = <InternalApp />;
  }

  return (
    <>
      <HeadContent />
      {content}
      <Toaster richColors position="top-center" dir="rtl" />
    </>
  );
}

function InternalApp() {
  useActionItemsSync();
  return (
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
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden p-3 sm:p-6">
            <Outlet />
          </main>
          <div className="pointer-events-none fixed bottom-2 left-2 z-40">
            <span className="rounded-md border border-border bg-card/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              {SUPABASE_ENABLED ? "מחובר ל-Supabase" : "נתוני דמה · מצב פיתוח"}
            </span>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
