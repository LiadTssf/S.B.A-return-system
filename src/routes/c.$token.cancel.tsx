import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabaseCustomerLinksAdapter, CustomerLinkError } from "@/adapters/supabaseCustomerLinksAdapter";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$token/cancel")({
  head: () => ({ meta: [{ title: "בקשת ביטול — ש.ב.א." }] }),
  component: CancelPage,
});

function CancelPage() {
  const token = useParams({ from: "/c/$token/cancel" }).token;
  return (
    <ExternalTokenGuard token={token} expectedAction="cancel_request">
      {({ rawToken, projectName, site }) => (
        <CancelForm rawToken={rawToken} projectName={projectName} site={site} />
      )}
    </ExternalTokenGuard>
  );
}

function CancelForm({
  rawToken,
  projectName,
  site,
}: {
  rawToken: string;
  projectName: string | null;
  site: string | null;
}) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.error("נא לציין סיבה");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await supabaseCustomerLinksAdapter.submitAction(rawToken, {
        type: "cancel_request",
        reason: reason.trim(),
      });
      setDone(true);
      toast.success("הבקשה נשלחה");
    } catch (e) {
      toast.error(e instanceof CustomerLinkError ? e.message : "שליחת הבקשה נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <ExternalShell title="הבקשה התקבלה" subtitle="ממתינה לבדיקת הצוות">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">בקשת הביטול נשלחה ותיבדק על ידי הצוות. נחזור אליך לאישור.</p>
        </div>
      </ExternalShell>
    );
  }

  const subtitle = [projectName, site].filter(Boolean).join(" · ") || undefined;
  return (
    <ExternalShell title="בקשת ביטול / שינוי החזרה" subtitle={subtitle}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">סיבת הבקשה *</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={5}
          placeholder="נא לפרט מדוע יש לבטל או לשנות את ההחזרה"
        />
        <p className="text-xs text-muted-foreground">{reason.length}/500</p>
      </div>
      <Button onClick={submit} disabled={reason.trim().length < 3 || submitting} className="min-h-11">
        {submitting ? "שולח..." : "שלח בקשה"}
      </Button>
    </ExternalShell>
  );
}
