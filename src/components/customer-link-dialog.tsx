import { useState } from "react";
import { Copy, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabaseCustomerLinksAdapter, CustomerLinkError } from "@/adapters/supabaseCustomerLinksAdapter";
import { SUPABASE_ENABLED } from "@/adapters";
import {
  CUSTOMER_ACTION_LABELS,
  CUSTOMER_ACTION_PATHS,
  type CustomerActionType,
} from "@/lib/customer-link-types";
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
} from "@/lib/document-types";
import type { ScheduleSegment } from "@/lib/schedule-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseId: string;
  segments: ScheduleSegment[];
}

const ACTIONS: CustomerActionType[] = ["sign_policy", "schedule", "upload_doc", "cancel_request"];
const UPLOAD_DOC_TYPES: DocumentCategory[] = ["delivery_note", "return_certificate", "other"];

function buildUrl(token: string, action: CustomerActionType): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/c/${token}/${CUSTOMER_ACTION_PATHS[action]}`;
}

export function CustomerLinkDialog({ open, onOpenChange, caseId, segments }: Props) {
  const [action, setAction] = useState<CustomerActionType>("schedule");
  const [segmentId, setSegmentId] = useState<string>("");
  const [docType, setDocType] = useState<DocumentCategory>("delivery_note");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsSegment = action === "upload_doc" && segments.length > 1;
  const isFileAction = action === "sign_policy" || action === "upload_doc";

  const handleCreate = async () => {
    if (!SUPABASE_ENABLED) {
      toast.error("יצירת קישור דורשת חיבור Supabase");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const issued = await supabaseCustomerLinksAdapter.issueToken({
        caseId,
        action,
        segmentId: needsSegment ? segmentId || undefined : segments[0]?.id,
        documentType: action === "upload_doc" ? docType : undefined,
      });
      const url = buildUrl(issued.token, action);
      setCreatedUrl(url);
      void navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("הקישור נוצר והועתק ללוח");
    } catch (e) {
      const msg =
        e instanceof CustomerLinkError && e.kind === "duplicate_active"
          ? "כבר קיים קישור פעיל לפעולה זו. יש לבטל או להחליף אותו תחילה."
          : e instanceof CustomerLinkError
            ? e.message
            : "יצירת הקישור נכשלה";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setCreatedUrl(null);
    setAction("schedule");
    setSegmentId("");
    setDocType("delivery_note");
    onOpenChange(false);
  };

  const copy = () => {
    if (!createdUrl) return;
    void navigator.clipboard?.writeText(createdUrl);
    toast.success("הועתק");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>יצירת קישור ללקוח</DialogTitle>
          <DialogDescription>
            הקישור חד-פעמי, תקף 24 שעות, ונשלח ללקוח דרך WhatsApp/SMS/Email.
          </DialogDescription>
        </DialogHeader>

        {!createdUrl ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>סוג פעולה *</Label>
              <Select value={action} onValueChange={(v) => setAction(v as CustomerActionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {CUSTOMER_ACTION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {action === "upload_doc" && (
              <div className="flex flex-col gap-1.5">
                <Label>סוג המסמך הנדרש *</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocumentCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_DOC_TYPES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DOCUMENT_CATEGORY_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsSegment && (
              <div className="flex flex-col gap-1.5">
                <Label>שיוך משאית (אופציונלי)</Label>
                <Select value={segmentId} onValueChange={setSegmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="כללי לתיק" />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map((s, i) => (
                      <SelectItem key={s.id} value={s.id}>
                        משאית {i + 1}
                        {s.truckId ? ` · ${s.truckId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isFileAction && (
              <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent-foreground">
                שים לב: העלאת קבצים/חתימה מאובטחת מהלקוח טרם הופעלה (תלוי ברכיב ההעלאה). הקישור יוצג ללקוח עם הודעת "בקרוב".
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>ביטול</Button>
              <Button onClick={handleCreate} disabled={busy} className="gap-2">
                <LinkIcon className="h-4 w-4" />
                {busy ? "יוצר..." : "צור קישור"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>הקישור החד-פעמי</Label>
              <div className="flex gap-2">
                <Input value={createdUrl} dir="ltr" readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={copy} aria-label="העתק">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                שלחי ללקוח דרך הערוץ המועדף. הקישור יידרש פעם אחת בלבד ותקף 24 שעות.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>סגור</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
