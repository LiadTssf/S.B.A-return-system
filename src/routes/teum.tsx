import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarClock, ArrowLeft, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { useCases } from "@/hooks/use-cases";
import { useAllSchedules } from "@/hooks/use-schedule";
import {
  getReturnWindow,
  toLocalIsoDate,
  type ScheduleSegment,
} from "@/lib/schedule-types";
import type { ReturnCase } from "@/lib/case-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teum")({
  head: () => ({
    meta: [
      { title: "תיאום החזרות — ש.ב.א." },
      { name: "description", content: "תיאום תאריכי החזרה, משאיות ותזמון הודעות ללקוח." },
    ],
  }),
  component: TeumPage,
});

function TeumPage() {
  const cases = useCases();
  const schedules = useAllSchedules();

  type Row = {
    c: (typeof cases)[number];
    seg: ScheduleSegment | undefined;
    segIndex?: number;
    totalSegs: number;
  };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of cases) {
      if (c.status === "completed") continue;
      const segs = schedules[c.id]?.segments ?? [];
      // תיק "בבדיקה" — מוצג בתיאום רק אם נותרו משאיות שלא הוחזרו או ממתינות לאישור לקוח
      if (c.status === "in_review" && segs.every((s) => s.actualDate)) continue;
      if (segs.length === 0) {
        out.push({ c, seg: undefined, totalSegs: 0 });
      } else {
        segs.forEach((seg, i) => {
          if (seg.actualDate) return;
          out.push({ c, seg, segIndex: i + 1, totalSegs: segs.length });
        });
        // אם כל הסגמנטים כבר הוחזרו, התיק כבר לא בתיאום — דלגי
      }
    }
    return out.sort((a, b) => {
      const aDate = a.seg?.plannedDate ?? "9999-12-31";
      const bDate = b.seg?.plannedDate ?? "9999-12-31";
      return aDate.localeCompare(bDate);
    });
  }, [cases, schedules]);

  const needsScheduling = rows.filter((r) => !r.seg?.plannedDate).length;
  const awaitingConfirm = rows.filter(
    (r) => !!r.seg?.plannedDate && !r.seg?.customerConfirmed,
  ).length;
  const awaitingReturn = rows.filter(
    (r) => !!r.seg?.customerConfirmed && !r.seg?.actualDate,
  ).length;
  const needsTruck = rows.filter((r) => r.seg?.plannedDate && !r.seg?.truckId).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">תיאום החזרות</h1>
        <p className="text-sm text-muted-foreground">
          תיקים שדורשים תיאום תאריך, שיוך משאית או הודעה ללקוח.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={CalendarClock} label="ממתינים לתיאום תאריך" value={needsScheduling} />
        <KpiCard icon={CalendarClock} label="ממתינים לאישור לקוח" value={awaitingConfirm} />
        <KpiCard icon={Truck} label="ממתינים להחזרה" value={awaitingReturn} />
        <KpiCard icon={Truck} label="ללא משאית" value={needsTruck} />
      </div>

      <Tabs defaultValue="list" dir="rtl">
        <TabsList>
          <TabsTrigger value="list">רשימה</TabsTrigger>
          <TabsTrigger value="calendar">לוח שנה</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <ListView rows={rows} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarView rows={rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ListView({
  rows,
}: {
  rows: {
    c: ReturnCase;
    seg: ScheduleSegment | undefined;
    segIndex?: number;
    totalSegs: number;
  }[];
}) {
  return (
    <>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            אין כרגע תיקים שדורשים תיאום. כל הכבוד!
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ c, seg, segIndex, totalSegs }) => {
            const key = seg ? `${c.id}-${seg.id}` : c.id;
            return (
              <Card key={key}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {c.id}
                      </span>
                      <CaseStatusBadge status={c.status} />
                      {segIndex && totalSegs > 1 && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                          משאית {segIndex} מתוך {totalSegs}
                        </span>
                      )}
                    </div>
                    <div className="font-medium">{c.customer}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.project} · {c.site}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-2 sm:text-sm">
                    <div>
                      <div className="text-muted-foreground">תאריך מתוכנן</div>
                      <div className="font-medium">
                        {seg?.plannedDate
                          ? (() => {
                              const [y, m, d] = seg.plannedDate!.split("-").map(Number);
                              const local = new Date(y, m - 1, d);
                              const win = getReturnWindow(seg.plannedDate!);
                              return `${format(local, "d.M.yyyy", { locale: he })}${win ? ` · ${win}` : ""}`;
                            })()
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">נהג</div>
                      <div className="font-medium">{seg?.driverName ?? "—"}</div>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="min-h-11 gap-1">
                    <Link to="/tikim/$caseId" params={{ caseId: c.id }}>
                      פתח תיק
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

type CalRow = {
  c: ReturnCase;
  seg: ScheduleSegment | undefined;
  segIndex?: number;
  totalSegs: number;
};

type SegStatus = "needs_truck" | "awaiting_confirm" | "awaiting_return" | "returned";

function segmentStatus(r: CalRow): SegStatus {
  const s = r.seg;
  if (!s) return "needs_truck";
  if (s.actualDate) return "returned";
  if (!s.truckId) return "needs_truck";
  if (!s.customerConfirmed) return "awaiting_confirm";
  return "awaiting_return";
}

const SEG_STATUS_LABEL: Record<SegStatus, string> = {
  needs_truck: "ללא משאית",
  awaiting_confirm: "ממתין לאישור לקוח",
  awaiting_return: "ממתין להחזרה",
  returned: "הוחזר",
};

const SEG_STATUS_DOT: Record<SegStatus, string> = {
  needs_truck: "bg-amber-500",
  awaiting_confirm: "bg-orange-500",
  awaiting_return: "bg-blue-500",
  returned: "bg-primary",
};

const SEG_STATUS_CHIP: Record<SegStatus, string> = {
  needs_truck: "bg-amber-500/15 text-amber-700",
  awaiting_confirm: "bg-orange-500/15 text-orange-700",
  awaiting_return: "bg-blue-500/15 text-blue-700",
  returned: "bg-primary/15 text-primary",
};

function CalendarView({ rows }: { rows: CalRow[] }) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedIso, setSelectedIso] = useState<string | null>(toLocalIsoDate(new Date()));

  // map date -> rows
  const byDate = useMemo(() => {
    const map = new Map<string, CalRow[]>();
    for (const r of rows) {
      const iso = r.seg?.plannedDate;
      if (!iso) continue;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(r);
    }
    return map;
  }, [rows]);

  const days = useMemo(
    () => (mode === "month" ? buildMonthGrid(cursor) : buildWeek(cursor)),
    [mode, cursor],
  );

  const monthLabel = format(cursor, "MMMM yyyy", { locale: he });
  const weekRange = (() => {
    if (mode !== "week") return "";
    const start = days[0];
    const end = days[days.length - 1];
    return `${format(start, "d.M", { locale: he })}–${format(end, "d.M.yyyy", { locale: he })}`;
  })();

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (mode === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + 7 * dir);
    setCursor(d);
  };

  const todayIso = toLocalIsoDate(new Date());
  const selectedItems = selectedIso ? (byDate.get(selectedIso) ?? []) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          <Button
            size="sm"
            variant={mode === "month" ? "default" : "ghost"}
            className="h-8"
            onClick={() => setMode("month")}
          >
            חודש
          </Button>
          <Button
            size="sm"
            variant={mode === "week" ? "default" : "ghost"}
            className="h-8"
            onClick={() => setMode("week")}
          >
            שבוע
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => shift(-1)}>
            {mode === "month" ? "חודש קודם" : "שבוע קודם"}
          </Button>
          <span className="min-w-32 text-center text-sm font-semibold">
            {mode === "month" ? monthLabel : weekRange}
          </span>
          <Button size="sm" variant="outline" onClick={() => shift(1)}>
            {mode === "month" ? "חודש הבא" : "שבוע הבא"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const t = new Date();
              t.setHours(0, 0, 0, 0);
              setCursor(t);
              setSelectedIso(toLocalIsoDate(t));
            }}
          >
            היום
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const iso = toLocalIsoDate(d);
              const inMonth = mode === "week" || d.getMonth() === cursor.getMonth();
              const items = byDate.get(iso) ?? [];
              const isToday = iso === todayIso;
              const isSel = iso === selectedIso;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIso(iso)}
                  className={cn(
                    "flex min-h-16 flex-col items-stretch rounded-md border p-1 text-right text-xs transition-colors",
                    inMonth ? "bg-background" : "bg-muted/40 text-muted-foreground",
                    isSel ? "border-primary ring-1 ring-primary" : "border-border",
                    isToday && "font-bold",
                  )}
                >
                  <span className={cn("self-end", isToday && "text-primary")}>
                    {d.getDate()}
                  </span>
                  {items.length > 0 && (
                    <div className="mt-auto flex flex-wrap items-center justify-end gap-0.5">
                      {items.slice(0, 3).map((r, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            SEG_STATUS_DOT[segmentStatus(r)],
                          )}
                        />
                      ))}
                      {items.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{items.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {selectedIso
            ? format(parseIso(selectedIso), "EEEE, d בMMMM yyyy", { locale: he })
            : "בחרי תאריך"}
        </h3>
        {selectedItems.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-xs text-muted-foreground">
              אין החזרות מתוכננות בתאריך זה.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedItems.map((r) => (
              <DayItem key={`${r.c.id}-${r.seg!.id}`} row={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayItem({ row }: { row: CalRow }) {
  const { c, seg, segIndex, totalSegs } = row;
  const status = segmentStatus(row);
  const win = seg?.plannedDate ? getReturnWindow(seg.plannedDate) : null;
  return (
    <Link
      to="/tikim/$caseId"
      params={{ caseId: c.id }}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {c.id}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  SEG_STATUS_CHIP[status],
                )}
              >
                {SEG_STATUS_LABEL[status]}
              </span>
              {segIndex && totalSegs > 1 && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  משאית {segIndex}/{totalSegs}
                </span>
              )}
            </div>
            <div className="truncate text-sm font-semibold">{c.customer}</div>
            <div className="truncate text-xs text-muted-foreground">
              {c.project} · {c.site}
            </div>
          </div>
          <div className="text-xs sm:text-sm">
            <div className="text-muted-foreground">חלון</div>
            <div className="font-medium">{win ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Build a Sunday-start month grid that includes leading/trailing days */
function buildMonthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

function buildWeek(cursor: Date): Date[] {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
