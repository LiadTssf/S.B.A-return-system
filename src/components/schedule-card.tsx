import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  CalendarPlus,
  CheckCircle2,
  FileText,
  ImageIcon,
  Plus,
  Trash2,
  Truck,
  UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/use-role";
import {
  can,
  CAN_SET_SCHEDULE,
  CAN_ASSIGN_TRUCK,
  CAN_MARK_RETURNED,
  CAN_CONFIRM_CUSTOMER,
} from "@/lib/permissions";
import { scheduleAdapter, documentsAdapter, casesAdapter, auditAdapter } from "@/adapters";
import { useCaseDocuments } from "@/hooks/use-documents";
import {
  DOCUMENT_CATEGORY_LABELS,
  isImage,
  type CaseDocument,
} from "@/lib/document-types";
import type { CaseStatus } from "@/lib/case-types";
import { toast } from "sonner";
import { ScheduleDialog, type ScheduleDialogMode } from "./schedule-dialog";
import { MarkReturnedDialog } from "./mark-returned-dialog";
import { useSchedule } from "@/hooks/use-schedule";
import { getReturnWindow, type ScheduleSegment } from "@/lib/schedule-types";

interface Props {
  caseId: string;
  caseStatus: CaseStatus;
  readOnly?: boolean;
}

type DialogState =
  | { mode: "date"; segment?: ScheduleSegment; segmentIndex?: number }
  | { mode: "truck"; segment: ScheduleSegment; segmentIndex: number };

// עזרים טהורים מעל רשימת המסמכים הריאקטיבית (במקום קריאות sync ל-store)
function certForSegment(docs: CaseDocument[], segmentId: string): boolean {
  return docs.some(
    (d) =>
      d.category === "return_certificate" &&
      d.attachment.type === "segment" &&
      d.attachment.segmentId === segmentId,
  );
}
function photoForSegment(docs: CaseDocument[], segmentId?: string): boolean {
  return docs.some(
    (d) =>
      d.category === "truck_photo" &&
      (segmentId
        ? (d.attachment.type === "case" ||
          (d.attachment.type === "segment" && d.attachment.segmentId === segmentId))
        : true),
  );
}
function docsForSegment(docs: CaseDocument[], segmentId: string): CaseDocument[] {
  return docs.filter(
    (d) => d.attachment.type === "segment" && d.attachment.segmentId === segmentId,
  );
}

export function ScheduleCard({ caseId, caseStatus, readOnly }: Props) {
  const schedule = useSchedule(caseId);
  // נצרך כאן רק כדי לרענן את הכרטיס כשמועלית/נמחקת תעודת החזרה
  const docs = useCaseDocuments(caseId);
  const role = useRole();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [returnedFor, setReturnedFor] = useState<ScheduleSegment | null>(null);

  const segments = schedule?.segments ?? [];
  const isClosed = caseStatus === "completed";
  const canDate = !readOnly && !isClosed && can(role, CAN_SET_SCHEDULE);
  const canTruck = !readOnly && !isClosed && can(role, CAN_ASSIGN_TRUCK);
  const canMark = !readOnly && !isClosed && can(role, CAN_MARK_RETURNED);
  const canConfirm = !readOnly && !isClosed && can(role, CAN_CONFIRM_CUSTOMER);

  /** מחשב סטטוס תיק נכון לפי כלל הסגמנטים ומעדכן אם השתנה */
  const recomputeCaseStatus = async (nextSegments: ScheduleSegment[]) => {
    if (caseStatus === "completed") return;
    if (nextSegments.length === 0) return;
    const allConfirmed = nextSegments.every((s) => s.customerConfirmed && s.plannedDate);
    const allReturned = nextSegments.every((s) => s.actualDate);
    let next: CaseStatus = "coordinating";
    if (allReturned) next = "in_review";
    else if (allConfirmed) next = "awaiting_return";
    if (next !== caseStatus) await casesAdapter.setStatus(caseId, next);
  };

  const handleDialogSubmit = async (
    state: DialogState,
    patch: Partial<Omit<ScheduleSegment, "id">>,
    summary: string,
    options: { dateChanged: boolean; isNew: boolean },
  ) => {
    let nextSegments: ScheduleSegment[];
    if (options.isNew) {
      const created = await scheduleAdapter.addSegment(caseId, patch);
      nextSegments = [...segments, created];
      auditAdapter.log("schedule_set", { caseId, detail: `משאית חדשה · ${summary}` });
      toast.success("משאית נוספה לתיק");
    } else {
      const seg = state.segment!;
      let mergedPatch = patch;
      // שינוי תאריך מאפס את אישור הלקוח לאותה משאית
      if (state.mode === "date" && options.dateChanged && seg.customerConfirmed) {
        mergedPatch = { ...patch, customerConfirmed: false };
        auditAdapter.log("update_case", {
          caseId,
          detail: `תאריך עודכן למשאית ${state.segmentIndex} — נדרש אישור לקוח מחדש`,
        });
        toast.info("התאריך השתנה — נדרש אישור לקוח מחדש למשאית זו");
      } else if (state.mode === "date") {
        auditAdapter.log("schedule_set", {
          caseId,
          detail: `משאית ${state.segmentIndex} · ${summary}`,
        });
        toast.success("התאריך עודכן");
      } else {
        auditAdapter.log("truck_assigned", {
          caseId,
          detail: `משאית ${state.segmentIndex} · ${summary}`,
        });
        toast.success("פרטי הנהג עודכנו");
      }
      const updated = await scheduleAdapter.updateSegment(caseId, seg.id, mergedPatch);
      nextSegments = segments.map((s) => (s.id === seg.id ? updated! : s));
    }
    await recomputeCaseStatus(nextSegments);
    setDialog(null);
  };

  const handleConfirmCustomer = async (seg: ScheduleSegment, idx: number) => {
    const updated = await scheduleAdapter.updateSegment(caseId, seg.id, { customerConfirmed: true });
    if (!updated) return;
    const nextSegments = segments.map((s) => (s.id === seg.id ? updated : s));
    auditAdapter.log("customer_confirmed", { caseId, detail: `משאית ${idx}` });
    toast.success(`אישור לקוח התקבל למשאית ${idx}`);
    await recomputeCaseStatus(nextSegments);
  };

  const handleReturned = async (iso: string, display: string) => {
    if (!returnedFor) return;
    const hasCert = certForSegment(docs, returnedFor.id);
    const hasPhoto = photoForSegment(docs, returnedFor.id);
    if (!hasCert || !hasPhoto) {
      auditAdapter.log("truck_close_blocked", {
        caseId,
        detail: `חסר: ${[!hasCert && "תעודת החזרה", !hasPhoto && "תמונת משאית"]
          .filter(Boolean)
          .join(" + ")}`,
      });
      toast.error(
        "לא ניתן לסגור את תיאום המשאית לפני העלאת תעודת החזרה ותמונת משאית.",
      );
      setReturnedFor(null);
      return;
    }
    const updated = await scheduleAdapter.updateSegment(caseId, returnedFor.id, { actualDate: iso });
    if (!updated) return;
    const idx = segments.findIndex((s) => s.id === returnedFor.id) + 1;
    const nextSegments = segments.map((s) => (s.id === returnedFor.id ? updated : s));
    auditAdapter.log("return_actual", { caseId, detail: `משאית ${idx} · ${display}` });
    auditAdapter.log("truck_closed", { caseId, detail: `משאית ${idx} · ${display}` });
    setReturnedFor(null);
    toast.success(`משאית ${idx} סומנה כהוחזרה`);
    await recomputeCaseStatus(nextSegments);
  };

  const handleRemove = async (seg: ScheduleSegment, idx: number) => {
    if (!confirm(`למחוק את משאית ${idx}?`)) return;
    await scheduleAdapter.removeSegment(caseId, seg.id);
    await documentsAdapter.removeForSegment(caseId, seg.id);
    auditAdapter.log("update_case", { caseId, detail: `משאית ${idx} הוסרה` });
    toast.success("המשאית הוסרה");
    const nextSegments = segments.filter((s) => s.id !== seg.id);
    if (nextSegments.length > 0) await recomputeCaseStatus(nextSegments);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">תאריכי החזרה ומשאיות</CardTitle>
        {canDate && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 gap-1"
            onClick={() => setDialog({ mode: "date" })}
          >
            <Plus className="h-4 w-4" />
            הוסף משאית
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            עדיין לא תואמה משאית. ניתן לתאם משאית אחת או יותר — כל משאית בתאריך נפרד.
          </p>
        ) : (
          segments.map((seg, i) => (
            <SegmentBlock
              key={seg.id}
              seg={seg}
              index={i + 1}
              canDate={canDate}
              canTruck={canTruck}
              canMark={canMark}
              canConfirm={canConfirm}
              hasCertificate={certForSegment(docs, seg.id)}
              hasTruckPhoto={photoForSegment(docs, seg.id)}
              documents={docsForSegment(docs, seg.id)}
              onEditDate={() =>
                setDialog({ mode: "date", segment: seg, segmentIndex: i + 1 })
              }
              onEditTruck={() =>
                setDialog({ mode: "truck", segment: seg, segmentIndex: i + 1 })
              }
              onConfirm={() => handleConfirmCustomer(seg, i + 1)}
              onMarkReturned={() => setReturnedFor(seg)}
              onRemove={() => handleRemove(seg, i + 1)}
            />
          ))
        )}
      </CardContent>

      {dialog && (
        <ScheduleDialog
          open={!!dialog}
          onOpenChange={(o) => !o && setDialog(null)}
          mode={dialog.mode}
          segment={dialog.segment}
          segmentIndex={dialog.segmentIndex}
          caseId={caseId}
          onSubmit={(patch, summary, options) =>
            handleDialogSubmit(dialog, patch, summary, options)
          }
        />
      )}

      <MarkReturnedDialog
        open={!!returnedFor}
        onOpenChange={(o) => !o && setReturnedFor(null)}
        defaultDate={returnedFor?.actualDate}
        onConfirm={handleReturned}
      />
    </Card>
  );
}

interface SegmentProps {
  seg: ScheduleSegment;
  index: number;
  canDate: boolean;
  canTruck: boolean;
  canMark: boolean;
  canConfirm: boolean;
  hasCertificate: boolean;
  hasTruckPhoto: boolean;
  documents: CaseDocument[];
  onEditDate: () => void;
  onEditTruck: () => void;
  onConfirm: () => void;
  onMarkReturned: () => void;
  onRemove: () => void;
}

function SegmentBlock({
  seg,
  index,
  canDate,
  canTruck,
  canMark,
  canConfirm,
  hasCertificate,
  hasTruckPhoto: hasPhoto,
  documents,
  onEditDate,
  onEditTruck,
  onConfirm,
  onMarkReturned,
  onRemove,
}: SegmentProps) {
  const dateLabel = seg.plannedDate
    ? (() => {
        const [y, m, d] = seg.plannedDate!.split("-").map(Number);
        const local = new Date(y, m - 1, d);
        const win = getReturnWindow(seg.plannedDate!);
        return `${format(local, "EEEE, d בMMMM yyyy", { locale: he })}${win ? ` · ${win}` : ""}`;
      })()
    : "—";

  const statusBadge = seg.actualDate ? (
    <Badge variant="default">הוחזרה</Badge>
  ) : seg.customerConfirmed ? (
    <Badge variant="secondary">ממתין להחזרה</Badge>
  ) : seg.plannedDate ? (
    <Badge variant="outline">ממתין לאישור לקוח</Badge>
  ) : (
    <Badge variant="outline">ללא תאריך</Badge>
  );

  const showConfirm = canConfirm && !!seg.plannedDate && !seg.customerConfirmed && !seg.actualDate;
  const showMark = canMark && !!seg.plannedDate && !!seg.customerConfirmed && !seg.actualDate;
  const proofReady = hasCertificate && hasPhoto;
  const markDisabled = showMark && !proofReady;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">משאית {index}</span>
          {statusBadge}
        </div>
        {canDate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={`מחק משאית ${index}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="תאריך מתוכנן" value={dateLabel} />
        <Field label="משאית" value={seg.truckId ?? "—"} ltr={!!seg.truckId} />
        <Field label="נהג" value={seg.driverName ?? "—"} />
        <Field
          label="טלפון נהג"
          value={seg.driverPhone ?? "—"}
          ltr={!!seg.driverPhone}
        />
        <Field
          label="הוחזר בפועל"
          value={
            seg.actualDate
              ? format(new Date(seg.actualDate), "dd.MM.yyyy", { locale: he })
              : "—"
          }
        />
        {seg.notes && <Field label="הערות" value={seg.notes} />}
      </div>

      {documents.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">קבצים משויכים</span>
          <ul className="flex flex-wrap gap-2">
            {documents.map((d) => (
              <li key={d.id}>
                <a
                  href={d.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={d.fileName}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted"
                  title={`${DOCUMENT_CATEGORY_LABELS[d.category]} · ${d.fileName}`}
                >
                  {isImage(d.mimeType) ? (
                    <img
                      src={d.dataUrl}
                      alt={d.title}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="flex flex-col items-start">
                    <span className="max-w-[160px] truncate font-medium">{d.title}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ImageIcon className="h-2.5 w-2.5" />
                      {DOCUMENT_CATEGORY_LABELS[d.category]}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canDate && (
          <Button variant="outline" size="sm" onClick={onEditDate} className="min-h-11 gap-2">
            <CalendarPlus className="h-4 w-4" />
            {seg.plannedDate ? "עדכון תאריך" : "תיאום תאריך"}
          </Button>
        )}
        {canTruck && (
          <Button variant="outline" size="sm" onClick={onEditTruck} className="min-h-11 gap-2">
            <Truck className="h-4 w-4" />
            {seg.driverName ? "עדכון פרטי נהג" : "הוספת פרטי נהג"}
          </Button>
        )}
        {showConfirm && (
          <Button variant="outline" size="sm" onClick={onConfirm} className="min-h-11 gap-2">
            <UserCheck className="h-4 w-4" />
            אישור לקוח התקבל
          </Button>
        )}
        {showMark && (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              onClick={onMarkReturned}
              disabled={markDisabled}
              className="min-h-11 gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              סימון החזרה בפועל
            </Button>
          </div>
        )}
      </div>

      {!seg.actualDate && (
        <div className="mt-3 rounded-md border border-border bg-background p-2 text-xs">
          <div className="mb-1 font-semibold">תנאים לסגירת תיאום המשאית</div>
          <ul className="flex flex-col gap-0.5">
            <li className={hasCertificate ? "text-primary" : "text-destructive"}>
              {hasCertificate ? "✓" : "✗"} תעודת החזרה הועלתה
            </li>
            <li className={hasPhoto ? "text-primary" : "text-destructive"}>
              {hasPhoto ? "✓" : "✗"} תמונת משאית הועלתה
            </li>
          </ul>
          <div className="mt-1 text-muted-foreground">
            {proofReady
              ? "ניתן לסגור את תיאום המשאית"
              : "יש להשלים את הקבצים החסרים לפני סגירת תיאום המשאית."}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={"font-medium " + (ltr ? "text-right" : "")} dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}
