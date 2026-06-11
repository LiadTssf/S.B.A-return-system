import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customerLinksAdapter, auditAdapter } from "@/adapters";
import { CUSTOMER_SYNC_MESSAGE } from "@/adapters/mockCustomerLinksAdapter";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$token/cancel")({
  head: () => ({ meta: [{ title: "בקשת ביטול — ש.ב.א." }] }),
  component: CancelPage,
});

function CancelPage() {
  return (
    <ExternalTokenGuard
      token={useParams({ from: "/c/$token/cancel" }).token}
      expectedAction="cancel_request"
    >
      {({ token, caseData }) => (
        <CancelForm token={token.token} caseId={caseData.id} customer={caseData.customer} />
      )}
    </ExternalTokenGuard>
  );
}

function CancelForm({ token, caseId, customer }: { token: string; caseId: string; customer: string }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.error("נא לציין סיבה");
      return;
    }
    const submission = await customerLinksAdapter.addSubmission({
      token,
      caseId,
      action: "cancel_request",
      payload: { type: "cancel_request", reason: reason.trim() },
    });
    auditAdapter.log("customer_cancel_request", { caseId, detail: reason.trim().slice(0, 100) });
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
      <ExternalShell title="הבקשה התקבלה" subtitle="ניצור קשר לבירור">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">בקשת הביטול נשלחה. נחזור אליך לאישור.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="בקשת ביטול החזרה" subtitle={`לקוח: ${customer}`}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">סיבת הביטול *</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={5}
          placeholder="נא לפרט מדוע יש לבטל את ההחזרה"
        />
        <p className="text-xs text-muted-foreground">{reason.length}/500</p>
      </div>
      <Button onClick={submit} disabled={reason.trim().length < 3} className="min-h-11">
        שלח בקשת ביטול
      </Button>
    </ExternalShell>
  );
}
