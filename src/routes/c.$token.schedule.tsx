import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon, CheckCircle2, PhoneCall, Plus, Trash2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getReturnWindow, isReturnableDate, toLocalIsoDate } from "@/lib/schedule-types";
import { supabaseCustomerLinksAdapter, CustomerLinkError } from "@/adapters/supabaseCustomerLinksAdapter";
import { toast } from "sonner";

type DraftSegment = { id: string; date?: Date; note: string };
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
  const token = useParams({ from: "/c/$token/schedule" }).token;
  return (
    <ExternalTokenGuard token={token} expectedAction="schedule">
      {({ rawToken, projectName, site }) => (
        <ScheduleForm rawToken={rawToken} projectName={projectName} site={site} />
      )}
    </ExternalTokenGuard>
  );
}

function ScheduleForm({
  rawToken,
  projectName,
  site,
}: {
  rawToken: string;
  projectName: string | null;
  site: string | null;
}) {
  const [segments, setSegments] = useState<DraftSegment[]>([createDraftSegment()]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasValidSelection = segments.every((segment) => {
    if (!segment.date) return false;
    return !!getReturnWindow(toLocalIsoDate(segment.date));
  });

  const handleSelect = (segmentId: string, d: Date | undefined) =>
    setSegments((cur) => cur.map((s) => (s.id === segmentId ? { ...s, date: d } : s)));
  const handleNoteChange = (segmentId: string, value: string) =>
    setSegments((cur) => cur.map((s) => (s.id === segmentId ? { ...s, note: value } : s)));
  const addTruckRequest = () => setSegments((cur) => [...cur, createDraftSegment()]);
  const removeTruckRequest = (segmentId: string) =>
    setSegments((cur) => (cur.length === 1 ? cur : cur.filter((s) => s.id !== segmentId)));

  const submit = async () => {
    if (!hasValidSelection || submitting) return;
    const payloadSegments = segments
      .filter((s) => s.date)
      .map((s) => ({ requestedDate: toLocalIsoDate(s.date!), note: s.note.trim() || undefined }));
    if (payloadSegments.length === 0) return;
    setSubmitting(true);
    try {
      // ה-RPC גוזר את התיק/הפעולה מהטוקן; אנו שולחים רק את נתוני הבקשה.
      await supabaseCustomerLinksAdapter.submitAction(rawToken, {
        type: "schedule",
        requestedDate: payloadSegments[0]?.requestedDate,
        note: payloadSegments[0]?.note,
        segments: payloadSegments,
      });
      setDone(true);
      toast.success("הבקשה נשלחה");
    } catch (e) {
      const msg = e instanceof CustomerLinkError ? e.message : "שליחת הבקשה נכשלה";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <ExternalShell title="הבקשה התקבלה" subtitle="ממתינה לאישור הצוות">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">קיבלנו את בקשת התיאום. נציג יבדוק ויאשר את המועד, ותקבלי הודעת אישור.</p>
        </div>
      </ExternalShell>
    );
  }

  const subtitle = [projectName, site].filter(Boolean).join(" · ") || undefined;
  return (
    <ExternalShell title="תיאום החזרה" subtitle={subtitle}>
      <div className="flex flex-col gap-4">
        {segments.map((segment, index) => {
          const isoDate = segment.date ? toLocalIsoDate(segment.date) : undefined;
          const dayWindow = isoDate ? getReturnWindow(isoDate) : null;
          return (
            <div key={segment.id} className="rounded-md border border-border bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">תאריך החזרה - משאית {index + 1}</div>
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
                        className={cn("min-h-11 justify-start gap-2 text-right font-normal", !segment.date && "text-muted-foreground")}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {segment.date ? format(segment.date, "EEEE, d בMMMM yyyy", { locale: he }) : "בחרי תאריך"}
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
                          return d < today;
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

        <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-xs">
          <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <span className="text-accent-foreground">
            המועד כפוף לאישור הצוות בהתאם לזמינות. לתיאום חריג ניתן להתקשר לעסק.
          </span>
        </div>
      </div>

      <Button onClick={submit} disabled={!hasValidSelection || submitting} className="min-h-11">
        {submitting ? "שולח..." : "שלח בקשה"}
      </Button>
    </ExternalShell>
  );
}
