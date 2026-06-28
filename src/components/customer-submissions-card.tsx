import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, Inbox, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/hooks/use-role";
import { can, CAN_REVIEW_CUSTOMER_SUBMISSION } from "@/lib/permissions";
import { useCaseSubmissions } from "@/hooks/use-customer-links";
import {
  supabaseCustomerLinksAdapter,
  CustomerLinkError,
  type SubmissionRecord,
} from "@/adapters/supabaseCustomerLinksAdapter";
import { scheduleAdapter, casesAdapter, documentsAdapter, SUPABASE_ENABLED } from "@/adapters";
import { PrototypeNotice } from "./prototype-notice";
import { docDisplayName, formatBytes, type CaseDocument } from "@/lib/document-types";
import {
  CUSTOMER_ACTION_LABELS,
  getScheduleRequestSegments,
  type CustomerSubmissionPayload,
} from "@/lib/customer-link-types";
import { toast } from "sonner";

interface Props {
  caseId: string;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FILE_ACTIONS = new Set(["sign_policy", "upload_doc"]);

function describe(s: SubmissionRecord): string {
  const p = s.payload as CustomerSubmissionPayload | null;
  switch (p?.type) {
    case "intake_request":
      return `בקשת החזרה חדשה — ${p.customerName} · ${p.company} · ${p.phone}\nפרויקט: ${p.project} · אתר: ${p.site}${p.note ? ` · ${p.note}` : ""}`;
    case "sign_policy":
      return `חתימה — ${p.signerName}`;
    case "schedule":
      return getScheduleRequestSegments(p)
        .map((seg, i) => `משאית ${i + 1}: ${seg.requestedDate}${seg.note ? ` · ${seg.note}` : ""}`)
        .join("\n");
    case "upload_doc":
      return `קובץ שהועלה: ${p.title}`;
    case "cancel_request":
      return `סיבה: ${p.reason}`;
    default:
      return CUSTOMER_ACTION_LABELS[s.action];
  }
}

export function CustomerSubmissionsCard({ caseId }: Props) {
  const role = useRole();
  const { items, refresh } = useCaseSubmissions(caseId);
  const canReview = can(role, CAN_REVIEW_CUSTOMER_SUBMISSION);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [rejecting, setRejecting] = useState<SubmissionRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(() => {
    if (!SUPABASE_ENABLED || !caseId) { setDocs([]); return; }
    documentsAdapter.listForCase(caseId).then(setDocs).catch(() => setDocs([]));
  }, [caseId]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  const refreshAll = () => { refresh(); loadDocs(); };

  const docForSubmission = (s: SubmissionRecord): CaseDocument | undefined =>
    docs.find((d) => d.customerTokenId && d.customerTokenId === s.customerTokenId);

  const openDoc = async (doc: CaseDocument) => {
    try {
      const u = await documentsAdapter.getViewUrl(doc);
      if (u) window.open(u, "_blank");
      else toast.error("לא ניתן לפתוח את הקובץ");
    } catch {
      toast.error("פתיחת הקובץ נכשלה");
    }
  };

  const applyApproved = async (s: SubmissionRecord) => {
    const p = s.payload as CustomerSubmissionPayload | null;
    if (p?.type === "schedule") {
      for (const seg of getScheduleRequestSegments(p)) {
        await scheduleAdapter.addSegment(caseId, {
          plannedDate: seg.requestedDate,
          notes: `אושר לבקשת הלקוח${seg.note ? ` · ${seg.note}` : ""}`,
          customerConfirmed: true,
        });
      }
      await casesAdapter.setStatus(caseId, "awaiting_return");
    } else if (p?.type === "cancel_request") {
      await casesAdapter.setStatus(caseId, "cancelled");
    }
  };

  const approve = async (s: SubmissionRecord) => {
    if (busy) return;
    setBusy(true);
    try {
      await supabaseCustomerLinksAdapter.reviewSubmission(s.id, "approved");
      await applyApproved(s);
      refreshAll();
      toast.success("הבקשה אושרה");
    } catch (e) {
      toast.error(e instanceof CustomerLinkError ? e.message : "האישור נכשל");
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejecting || busy) return;
    setBusy(true);
    try {
      await supabaseCustomerLinksAdapter.reviewSubmission(rejecting.id, "rejected", rejectNote.trim() || undefined);
      setRejecting(null);
      setRejectNote("");
      refreshAll();
      toast.success("הבקשה נדחתה");
    } catch (e) {
      toast.error(e instanceof CustomerLinkError ? e.message : "הדחייה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">בקשות ופעולות לקוח</CardTitle>
      </CardHeader>
      <CardContent>
        {!SUPABASE_ENABLED && (
          <PrototypeNotice title="בקשות לקוח — דורש Supabase">
            בקשות הלקוח נשמרות ב-Supabase. הגדר חיבור Supabase כדי לצפות ולסקור בקשות.
          </PrototypeNotice>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין כרגע בקשות מהלקוח עבור תיק זה.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((s) => {
              const isPending = s.status === "pending_review";
              const isAuto = s.status === "auto_applied";
              const doc = FILE_ACTIONS.has(s.action) ? docForSubmission(s) : undefined;
              return (
                <li key={s.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {CUSTOMER_ACTION_LABELS[s.action]}
                    </div>
                    <div className="flex items-center gap-2">
                      {isAuto && <Badge variant="outline" className="border-primary/40 text-primary">בוצע אוטומטית</Badge>}
                      {isPending && <Badge variant="outline" className="border-accent/50 text-accent-foreground bg-accent/10">ממתין לאישור</Badge>}
                      {s.status === "approved" && <Badge variant="outline" className="border-primary/40 text-primary">אושר</Badge>}
                      {s.status === "rejected" && <Badge variant="outline" className="border-destructive/40 text-destructive">נדחה</Badge>}
                      <span className="tabular-nums text-xs text-muted-foreground">{formatDateTime(s.submittedAt)}</span>
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground">{describe(s)}</p>
                  {doc && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{docDisplayName(doc)}{doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""}</span>
                      <Button size="sm" variant="ghost" className="ms-auto h-7 gap-1 px-2" onClick={() => openDoc(doc)}>
                        <Download className="h-3.5 w-3.5" />
                        צפה
                      </Button>
                    </div>
                  )}
                  {s.reviewNote && <p className="mt-1 text-xs text-muted-foreground">הערה: {s.reviewNote}</p>}
                  {isPending && canReview && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => approve(s)} disabled={busy} className="gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        אשר
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(s)} disabled={busy} className="gap-1">
                        <XCircle className="h-3.5 w-3.5" />
                        דחה
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {items.length > 0 && !canReview && items.some((s) => s.status === "pending_review") && (
          <p className="mt-3 text-xs text-muted-foreground">מצב צפייה בלבד — אין הרשאה לאשר או לדחות בקשות לקוח.</p>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>דחיית בקשת לקוח</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rej-note">הערת דחייה (אופציונלי)</Label>
            <Textarea
              id="rej-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              maxLength={300}
              placeholder="לדוגמה: התעודה אינה תואמת את רשימת הציוד"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>ביטול</Button>
            <Button variant="destructive" onClick={submitReject} disabled={busy}>דחה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
