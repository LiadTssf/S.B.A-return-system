import { useState } from "react";
import { CheckCircle2, FileText, Inbox, XCircle } from "lucide-react";
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
import { ROLE_LABELS } from "@/lib/roles";
import {
  can,
  CAN_REVIEW_CUSTOMER_SUBMISSION,
} from "@/lib/permissions";
import { useCaseSubmissions } from "@/hooks/use-customer-links";
import { customerLinksAdapter, scheduleAdapter, casesAdapter, auditAdapter, actionItemsAdapter } from "@/adapters";
import {
  CUSTOMER_ACTION_LABELS,
  getScheduleRequestSegments,
  type CustomerSubmission,
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

function describe(s: CustomerSubmission): string {
  const p = s.payload;
  switch (p.type) {
    case "intake_request":
      return `בקשת החזרה חדשה — ${p.customerName} · ${p.company} · ${p.phone}\nפרויקט: ${p.project} · אתר: ${p.site}${
        p.note ? ` · ${p.note}` : ""
      }`;
    case "sign_policy":
      return `חתימה — ${p.signerName}`;
    case "schedule": {
      const segments = getScheduleRequestSegments(p);
      return segments
        .map(
          (segment, index) =>
            `משאית ${index + 1}: ${segment.requestedDate}${segment.note ? ` · ${segment.note}` : ""}`,
        )
        .join("\n");
    }
    case "upload_doc":
      return `קובץ הועלה: ${p.title}`;
    case "cancel_request":
      return `סיבה: ${p.reason}`;
  }
}

export function CustomerSubmissionsCard({ caseId }: Props) {
  const role = useRole();
  const items = useCaseSubmissions(caseId);
  const canReview = can(role, CAN_REVIEW_CUSTOMER_SUBMISSION);
  const [rejecting, setRejecting] = useState<CustomerSubmission | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const approve = async (s: CustomerSubmission) => {
    if (s.payload.type === "schedule") {
      for (const segment of getScheduleRequestSegments(s.payload)) {
        await scheduleAdapter.addSegment(caseId, {
          plannedDate: segment.requestedDate,
          notes: `אושר לבקשת הלקוח${segment.note ? ` · ${segment.note}` : ""}`,
          customerConfirmed: true,
        });
      }
      await casesAdapter.setStatus(caseId, "awaiting_return");
    }
    if (s.payload.type === "cancel_request") {
      await casesAdapter.setStatus(caseId, "cancelled");
    }
    if (s.payload.type === "intake_request") {
      auditAdapter.log("update_case", {
        caseId,
        detail: `אישור בקשת לקוח חדש · ${s.payload.company}`,
      });
    }
    await customerLinksAdapter.setSubmissionStatus(s.id, "approved", ROLE_LABELS[role]);
    await actionItemsAdapter.markHandledByKey(`sub:${s.id}`, ROLE_LABELS[role]);
    auditAdapter.log("customer_submission_approved", {
      caseId,
      detail: CUSTOMER_ACTION_LABELS[s.action],
    });
    toast.success("הבקשה אושרה");
  };

  const submitReject = async () => {
    if (!rejecting) return;
    await customerLinksAdapter.setSubmissionStatus(rejecting.id, "rejected", ROLE_LABELS[role], rejectNote.trim() || undefined);
    await actionItemsAdapter.markHandledByKey(`sub:${rejecting.id}`, ROLE_LABELS[role]);
    if (rejecting.action === "schedule" || rejecting.action === "cancel_request") {
      await customerLinksAdapter.createToken({
        caseId,
        action: rejecting.action,
        createdBy: ROLE_LABELS[role],
      });
    }
    auditAdapter.log("customer_submission_rejected", {
      caseId,
      detail: `${CUSTOMER_ACTION_LABELS[rejecting.action]}${rejectNote ? ` · ${rejectNote}` : ""}`,
    });
    setRejecting(null);
    setRejectNote("");
    toast.success("הבקשה נדחתה");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">בקשות ופעולות לקוח</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            אין כרגע בקשות מהלקוח עבור תיק זה.
          </p>
        ) : (
        <ul className="flex flex-col gap-3">
          {items.map((s) => {
            const isPending = s.status === "pending_review";
            const isAuto = s.status === "auto_applied";
            return (
              <li key={s.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {CUSTOMER_ACTION_LABELS[s.action]}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAuto && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        בוצע אוטומטית
                      </Badge>
                    )}
                    {isPending && (
                      <Badge variant="outline" className="border-accent/50 text-accent-foreground bg-accent/10">
                        ממתין לאישור
                      </Badge>
                    )}
                    {s.status === "approved" && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        אושר
                      </Badge>
                    )}
                    {s.status === "rejected" && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        נדחה
                      </Badge>
                    )}
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {formatDateTime(s.submittedAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-foreground">{describe(s)}</p>
                {s.reviewNote && (
                  <p className="mt-1 text-xs text-muted-foreground">הערה: {s.reviewNote}</p>
                )}
                {isPending && canReview && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => approve(s)} className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      אשר
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(s)} className="gap-1">
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
          <p className="mt-3 text-xs text-muted-foreground">
            מצב צפייה בלבד — אין הרשאה לאשר או לדחות בקשות לקוח.
          </p>
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
              placeholder="לדוגמה: היום בקשה תפוסה, נציע מועד חלופי"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={submitReject}>
              דחה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
