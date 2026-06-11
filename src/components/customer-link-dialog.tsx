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
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS } from "@/lib/roles";
import { customerLinksAdapter, auditAdapter } from "@/adapters";
import {
  CUSTOMER_ACTION_LABELS,
  CUSTOMER_ACTION_PATHS,
  type CustomerActionType,
} from "@/lib/customer-link-types";
import type { ScheduleSegment } from "@/lib/schedule-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseId: string;
  segments: ScheduleSegment[];
}

const ACTIONS: CustomerActionType[] = [
  "sign_policy",
  "schedule",
  "upload_doc",
  "cancel_request",
];

function buildUrl(token: string, action: CustomerActionType): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/c/${token}/${CUSTOMER_ACTION_PATHS[action]}`;
}

export function CustomerLinkDialog({ open, onOpenChange, caseId, segments }: Props) {
  const role = useRole();
  const [action, setAction] = useState<CustomerActionType>("sign_policy");
  const [segmentId, setSegmentId] = useState<string>("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const needsSegment = action === "upload_doc" && segments.length > 1;

  // TODO: replace token validation with Supabase customer_tokens table
  const handleCreate = async () => {
    const t = await customerLinksAdapter.createToken({
      caseId,
      action,
      segmentId: needsSegment ? segmentId || undefined : segments[0]?.id,
      createdBy: ROLE_LABELS[role],
    });
    const url = buildUrl(t.token, t.action);
    setCreatedUrl(url);
    auditAdapter.log("customer_link_created", {
      caseId,
      detail: CUSTOMER_ACTION_LABELS[action],
    });
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("הקישור נוצר והועתק ללוח");
  };

  const handleClose = () => {
    setCreatedUrl(null);
    setAction("sign_policy");
    setSegmentId("");
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
            הקישור חד-פעמי, תקף 7 ימים, ונשלח ללקוח דרך WhatsApp/SMS/Email.
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

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                ביטול
              </Button>
              <Button onClick={handleCreate} className="gap-2">
                <LinkIcon className="h-4 w-4" />
                צור קישור
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
                שלחי ללקוח דרך הערוץ המועדף. הקישור יידרש פעם אחת בלבד.
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
