import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { AlertCircle, CalendarIcon, CheckCircle2, PhoneCall, Plus, Trash2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getReturnWindow,
  isReturnableDate,
  MAX_RETURNS_PER_DAY,
  toLocalIsoDate,
} from "@/lib/schedule-types";
import { useAllSchedules } from "@/hooks/use-schedule";
import { customerLinksAdapter, scheduleAdapter, auditAdapter } from "@/adapters";
import { CUSTOMER_SYNC_MESSAGE } from "@/adapters/mockCustomerLinksAdapter";
import { toast } from "sonner";

type DraftSegment = {
  id: string;
  date?: Date;
  note: string;
};

function createDraftSegment(): DraftSegment {
  return { id: crypto.randomUUID(), note: "" };
}

function formatRequestSummary(segment: DraftSegment) {
  if (!segment.date) return "";
  const iso = toLocalIsoDate(segment.date);
  const window = getReturnWindow(iso);
  return `${format(segment.date, "EEEE, d בMMMM yyyy", { locale: he })}${window ? ` · ${window}` : ""}`;
}

export const Route = createFileRoute("/c/$token/schedule")({
  head: () => ({ meta: [{ title: "תיאום החזרה — ש.ב.א." }] }),
  component: SchedulePage,
});

function SchedulePage() {
  return (
    <ExternalTokenGuard
      token={useParams({ from: "/c/$token/schedule" }).token}
      expectedAction="schedule"
    >
      {({ token, caseData }) => (
        <ScheduleForm token={token.token} caseId={caseData.id} customer={caseData.customer} />
      )}
    </ExternalTokenGuard>
  );
}

function ScheduleForm({ token, caseId, customer }: { token: string; caseId: string; customer: string }) {
  const [segments, setSegments] = useState<DraftSegment[]>([createDraftSegment()]);
  const [done, setDone] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  useEffect(() => {
    scheduleAdapter.rehydrateFromHash();
  }, []);

  // נרשם לעדכוני schedule-store כדי שתאריכים תפוסים יזוהו בזמן אמת
  const allSchedules = useAllSchedules();

  const fullDates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sched of Object.values(allSchedules)) {
      for (const seg of sched.segments) {
        if (!seg.plannedDate) continue;
        counts.set(seg.plannedDate, (counts.get(seg.plannedDate) ?? 0) + 1);
      }
    }
    const dates = new Set<string>();
    for (const [iso, n] of counts) {
      if (n >= MAX_RETURNS_PER_DAY) dates.add(iso);
    }
    return dates;
  }, [allSchedules]);

  const isDateFull = (d: Date) => fullDates.has(toLocalIsoDate(d));

  const hasValidSelection = segments.every((segment) => {
    if (!segment.date) return false;
    const iso = toLocalIsoDate(segment.date);
    return !!getReturnWindow(iso) && !fullDates.has(iso);
  });

  const handleSelect = (segmentId: string, d: Date | undefined) => {
    if (!d) {
      setSegments((current) =>
        current.map((segment) =>
          segment.id === segmentId ? { ...segment, date: undefined } : segment,
        ),
      );
      setBlockedNotice(null);
      return;
    }

    if (isDateFull(d)) {
      setBlockedNotice(
        `התאריך ${format(d, "dd/MM/yyyy")} אינו זמין לבחירה מקוונת. לתיאום חריג יש להתקשר לעסק.`,
      );
      return;
    }

    setBlockedNotice(null);
    setSegments((current) =>
      current.map((segment) => (segment.id === segmentId ? { ...segment, date: d } : segment)),
    );
  };

  const handleNoteChange = (segmentId: string, value: string) => {
    setSegments((current) =>
      current.map((segment) =>
        segment.id === segmentId ? { ...segment, note: value } : segment,
      ),
    );
  };

  const addTruckRequest = () => {
    setSegments((current) => [...current, createDraftSegment()]);
  };

  const removeTruckRequest = (segmentId: string) => {
    setSegments((current) =>
      current.length === 1 ? current : current.filter((segment) => segment.id !== segmentId),
    );
  };

  const submit = async () => {
    if (!hasValidSelection) return;
    const payloadSegments = segments
      .filter((segment) => segment.date)
      .map((segment) => ({
        requestedDate: toLocalIsoDate(segment.date!),
        note: segment.note.trim() || undefined,
      }));
    if (payloadSegments.length === 0) return;

    const submission = await customerLinksAdapter.addSubmission({
      token,
      caseId,
      action: "schedule",
      payload: {
        type: "schedule",
        requestedDate: payloadSegments[0]?.requestedDate,
        note: payloadSegments[0]?.note,
        segments: payloadSegments,
      },
    });
    auditAdapter.log("customer_schedule_request", {
      caseId,
      detail: payloadSegments.map((segment) => segment.requestedDate).join(", "),
    });
    if (typeof window !== "undefined") {
      try {
        window.opener?.postMessage(
          { source: CUSTOMER_SYNC_MESSAGE, submissions: [submission] },
          window.location.origin,
        );
      } catch {
        // ignore cross-window sync errors
      }
    }
    setDone(true);
    toast.success("הבקשה נשלחה");
  };

  if (done) {
    return (
      <ExternalShell title="הבקשה התקבלה" subtitle="ניצור קשר לאישור סופי">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">קיבלנו את בקשת התיאום. נציג יחזור אליך בהקדם לאישור.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="תיאום החזרה" subtitle={`לקוח: ${customer}`}>
      <div className="flex flex-col gap-4">
        {segments.map((segment, index) => {
          const isoDate = segment.date ? toLocalIsoDate(segment.date) : undefined;
          const dayWindow = isoDate ? getReturnWindow(isoDate) : null;
          const isDayFull = !!isoDate && fullDates.has(isoDate);

          return (
            <div key={segment.id} className="rounded-md border border-border bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">עדכון תאריך החזרה - משאית {index + 1}</div>
                {segments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={() => removeTruckRequest(segment.id)}
                    aria-label={`מחק בקשת משאית ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>תאריך מתוכנן *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "min-h-11 justify-start gap-2 text-right font-normal",
                          !segment.date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {segment.date
                          ? format(segment.date, "EEEE, d בMMMM yyyy", { locale: he })
                          : "בחרי תאריך"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={segment.date}
                        onSelect={(value) => handleSelect(segment.id, value)}
                        disabled={(d) => {
                          if (!isReturnableDate(d)) return true;
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          if (d < today) return true;
                          return fullDates.has(toLocalIsoDate(d));
                        }}
                        modifiers={{ full: (d) => isReturnableDate(d) && fullDates.has(toLocalIsoDate(d)) }}
                        modifiersClassNames={{
                          full: "line-through text-destructive opacity-70",
                        }}
                        initialFocus
                        locale={he}
                        dir="rtl"
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    ימי החזרה: א'-ד' 09:00–14:00 · ה' 09:00–13:00 · ו'-ש' סגור
                  </p>
                </div>

                {segment.date && dayWindow && (
                  <div className="rounded-md border border-border bg-background p-3 text-sm">
                    <span className="text-muted-foreground">חלון שעות החזרה: </span>
                    <span className="font-medium" dir="ltr">{dayWindow}</span>
                  </div>
                )}

                {isDayFull && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>התאריך אינו זמין לבחירה מקוונת. לתיאום חריג יש להתקשר לעסק.</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`note-${segment.id}`}>הערות לתיאום</Label>
                  <Textarea
                    id={`note-${segment.id}`}
                    value={segment.note}
                    onChange={(e) => handleNoteChange(segment.id, e.target.value)}
                    placeholder="למשל: ליצור קשר טלפוני לפני הגעה"
                    rows={3}
                    maxLength={300}
                  />
                </div>

                {segment.date && (
                  <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                    {formatRequestSummary(segment)}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" onClick={addTruckRequest} className="min-h-11 gap-2 self-start">
          <Plus className="h-4 w-4" />
          הוספת משאית חדשה
        </Button>

        <Separator />

        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <PhoneCall className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            לקביעת תאריך חסום יש להתקשר לעסק על מנת לבדוק אפשרות לזימון חריג.
          </span>
        </div>

        {blockedNotice && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <PhoneCall className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{blockedNotice}</span>
          </div>
        )}
      </div>

      <Button onClick={submit} disabled={!hasValidSelection} className="min-h-11">
        שלח בקשה
      </Button>
    </ExternalShell>
  );
}
