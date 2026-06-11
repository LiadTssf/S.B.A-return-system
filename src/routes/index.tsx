import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  Bell,
  CalendarDays,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCases } from "@/hooks/use-cases";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { ActionItemRow } from "@/components/action-item-row";
import { useAllActionItems } from "@/hooks/use-action-items";
import { useAllSchedules } from "@/hooks/use-schedule";
import { getReturnWindow, toLocalIsoDate } from "@/lib/schedule-types";
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS } from "@/lib/roles";
import {
  can,
  CAN_DISMISS_NOTIFICATION,
  CAN_HANDLE_NOTIFICATION,
  CAN_VIEW_NOTIFICATIONS,
} from "@/lib/permissions";
import { actionItemsAdapter, auditAdapter } from "@/adapters";
import { toast } from "sonner";
import { useMemo } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "דשבורד — ש.ב.א. ניהול החזרות" },
      {
        name: "description",
        content: "תמונת מצב כוללת של תיקי החזרה פעילים, סטטוסים ופעולות נדרשות.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const cases = useCases();
  const schedules = useAllSchedules();
  const role = useRole();
  const allItems = useAllActionItems();
  const canViewQueue = can(role, CAN_VIEW_NOTIFICATIONS);
  const canHandle = can(role, CAN_HANDLE_NOTIFICATION);
  const canDismissPerm = can(role, CAN_DISMISS_NOTIFICATION);
  const workQueue = useMemo(
    () => allItems.filter((i) => i.status === "open").slice(0, 5),
    [allItems],
  );
  const openCount = useMemo(
    () => allItems.filter((i) => i.status === "open").length,
    [allItems],
  );
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return [
      {
        label: "תיקים פעילים",
        value: cases.filter((c) => c.status !== "completed").length,
        icon: FolderOpen,
        tone: "primary" as const,
      },
      {
        label: "ממתינים להחזרה",
        value: cases.filter((c) => c.status === "awaiting_return").length,
        icon: Clock,
        tone: "accent" as const,
      },
      {
        label: "בבדיקה",
        value: cases.filter((c) => c.status === "in_review").length,
        icon: AlertCircle,
        tone: "muted" as const,
      },
      {
        label: "הושלמו השבוע",
        value: cases.filter(
          (c) => c.status === "completed" && c.closedAt && new Date(c.closedAt).getTime() >= weekAgo,
        ).length,
        icon: CheckCircle2,
        tone: "success" as const,
      },
    ];
  }, [cases]);

  const recent = cases.slice(0, 5);

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = toLocalIsoDate(today);
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    const endIso = toLocalIsoDate(end);
    const caseById = new Map(cases.map((c) => [c.id, c]));
    type U = {
      iso: string;
      caseId: string;
      customer: string;
      project: string;
      truckId?: string;
    };
    const out: U[] = [];
    for (const sched of Object.values(schedules)) {
      const c = caseById.get(sched.caseId);
      if (!c || c.status === "completed") continue;
      for (const seg of sched.segments) {
        if (!seg.plannedDate || seg.actualDate) continue;
        if (seg.plannedDate < todayIso || seg.plannedDate > endIso) continue;
        out.push({
          iso: seg.plannedDate,
          caseId: c.id,
          customer: c.customer,
          project: c.project,
          truckId: seg.truckId,
        });
      }
    }
    return out.sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 6);
  }, [cases, schedules]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">דשבורד ניהול החזרות</h1>
        <p className="text-sm text-muted-foreground">
          תמונת מצב כוללת. בחרי פעולה מהתפריט הצדדי.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="relative overflow-hidden border-t-[3px] border-t-accent shadow-[var(--shadow-card)]"
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md " +
                  (s.tone === "primary"
                    ? "bg-primary/10 text-primary"
                    : s.tone === "accent"
                      ? "bg-accent/15 text-accent"
                      : s.tone === "success"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground")
                }
              >
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold tabular-nums text-accent">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {canViewQueue && (
        <section>
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-accent" />
                השבוע ביומן — תיאומים קרובים
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/teum">ללוח השנה ←</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  אין החזרות מתוזמנות בשבוע הקרוב.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {upcoming.map((u, i) => {
                    const [y, m, d] = u.iso.split("-").map(Number);
                    const dt = new Date(y, m - 1, d);
                    const win = getReturnWindow(u.iso);
                    return (
                      <li key={`${u.caseId}-${u.iso}-${i}`}>
                        <Link
                          to="/tikim/$caseId"
                          params={{ caseId: u.caseId }}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-sm hover:border-primary/40"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{u.customer}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {u.project} · {u.caseId}
                            </span>
                          </div>
                          <div className="text-xs">
                            <div className="font-medium">
                              {dt.toLocaleDateString("he-IL", {
                                weekday: "short",
                                day: "numeric",
                                month: "numeric",
                              })}
                            </div>
                            <div className="text-muted-foreground">{win ?? "—"}</div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-primary" />
                תור עבודה — פעולות לטיפול
                {openCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                    {openCount}
                  </span>
                )}
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/notifications">לכל ההתראות ←</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {workQueue.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  אין כרגע פעולות פתוחות לטיפול. עבודה נקייה!
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {workQueue.map((item) => (
                    <ActionItemRow
                      key={item.id}
                      item={item}
                      canHandle={canHandle}
                      canDismiss={canDismissPerm}
                      compact
                      onHandle={async (it) => {
                        await actionItemsAdapter.markHandled(it.id, ROLE_LABELS[role]);
                        await auditAdapter.log("action_item_handled", {
                          caseId: it.returnCaseId,
                          detail: it.title,
                        });
                        toast.success("סומן כטופל");
                      }}
                      onDismiss={async (it) => {
                        await actionItemsAdapter.markDismissed(it.id, ROLE_LABELS[role]);
                        await auditAdapter.log("action_item_dismissed", {
                          caseId: it.returnCaseId,
                          detail: it.title,
                        });
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">תיקים אחרונים</h2>
          <Link to="/tikim" className="text-xs text-primary hover:underline">
            לכל התיקים ←
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              אין עדיין תיקים. פתחי תיק חדש דרך מסך התיקים.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((c) => (
              <Link
                key={c.id}
                to="/tikim/$caseId"
                params={{ caseId: c.id }}
                className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {c.id}
                        </span>
                        <span className="truncate font-semibold">{c.customer}</span>
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {c.project} · {c.site}
                      </span>
                    </div>
                    <CaseStatusBadge status={c.status} className="self-start sm:self-auto" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
