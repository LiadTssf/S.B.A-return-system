import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { customerLinksAdapter, documentsAdapter, auditAdapter } from "@/adapters";
import { toast } from "sonner";

const SYNC_MESSAGE = "sba.external_action_sync";

// המרת dataURL (PNG מה-SignaturePad) ל-File להעלאה ל-Storage
function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

export const Route = createFileRoute("/c/$token/sign")({
  head: () => ({ meta: [{ title: "חתימה דיגיטלית — ש.ב.א." }] }),
  component: SignPage,
});

const POLICY = `נוהל החזרת ציוד — ש.ב.א.

1. הציוד יוחזר במצב תקין, נקי וכשיר לשימוש.
2. החזרה תתבצע בתיאום מראש בלבד, בימים א'-ה'.
3. ליקויים יזוכו או יחויבו לפי תעודת בדיקה.
4. המסירה הסופית כפופה לאישור מנהל המפעל.`;

function SignPage() {
  return (
    <ExternalTokenGuard
      token={useParams({ from: "/c/$token/sign" }).token}
      expectedAction="sign_policy"
    >
      {({ token, caseData }) => <SignForm token={token.token} caseId={caseData.id} customer={caseData.customer} />}
    </ExternalTokenGuard>
  );
}

function SignForm({ token, caseId, customer }: { token: string; caseId: string; customer: string }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = name.trim().length >= 2 && agreed && !!signature;

  const submit = async () => {
    if (!canSubmit || !signature) return;
    const sigFile = dataUrlToFile(signature, `policy-signature-${caseId}.png`);
    const doc = await documentsAdapter.add({
      caseId,
      category: "signed_policy",
      attachment: { type: "case" },
      file: sigFile,
      fileName: sigFile.name,
      title: `חתימה על נוהל ההחזרה — ${name.trim()}`,
      mimeType: sigFile.type,
      sizeBytes: sigFile.size,
      uploadedBy: name.trim(),
      uploadedByRole: "לקוח חיצוני",
    });
    const submission = await customerLinksAdapter.addSubmission({
      token,
      caseId,
      action: "sign_policy",
      payload: { type: "sign_policy", signerName: name.trim(), signatureDataUrl: signature, agreed: true },
    });
    auditAdapter.log("policy_signed", { caseId, detail: `חתום ע״י ${name.trim()}` });
    if (typeof window !== "undefined") {
      const payload = {
        source: SYNC_MESSAGE,
        documents: [doc],
        submissions: [submission],
      };
      try {
        window.opener?.postMessage(payload, window.location.origin);
      } catch {
        // ignore sync failures between windows
      }
    }
    setDone(true);
    toast.success("החתימה נשמרה");
  };

  if (done) {
    return (
      <ExternalShell title="תודה!" subtitle="החתימה נקלטה במערכת">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">החתימה התקבלה בהצלחה. תודה על שיתוף הפעולה.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="חתימה על נוהל החזרה" subtitle={`לקוח: ${customer}`}>
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-xs font-semibold text-muted-foreground">נוהל החזרה</p>
        <pre className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{POLICY}</pre>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signer">שם החותם *</Label>
        <Input id="signer" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>חתימה *</Label>
        <SignaturePad onChange={setSignature} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
        <span>קראתי את הנוהל ואני מאשר/ת את תוכנו.</span>
      </label>

      <Button onClick={submit} disabled={!canSubmit} className="min-h-11">
        שליחת חתימה
      </Button>
    </ExternalShell>
  );
}
