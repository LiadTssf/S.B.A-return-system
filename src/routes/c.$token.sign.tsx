import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { uploadCustomerFile, type UploadPhase } from "@/lib/customer-upload";
import { CustomerLinkError } from "@/adapters/supabaseCustomerLinksAdapter";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$token/sign")({
  head: () => ({ meta: [{ title: "חתימה דיגיטלית — ש.ב.א." }] }),
  component: SignPage,
});

const POLICY_VERSION = "1.0";
const POLICY = `נוהל החזרת ציוד — ש.ב.א.

1. הציוד יוחזר במצב תקין, נקי וכשיר לשימוש.
2. החזרה תתבצע בתיאום מראש בלבד, בימים א'-ה'.
3. ליקויים יזוכו או יחויבו לפי תעודת בדיקה.
4. המסירה הסופית כפופה לאישור מנהל המפעל.`;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// מרכיב מסמך נוהל-חתום שלם (PNG) בדפדפן: נוסח הנוהל + פרטי חותם + תאריך + פרויקט/אתר +
// אישור הסכמה + תמונת החתימה + גרסת נוהל + hash תוכן. מוחזר כ-Blob (אין Base64 ב-JSON/localStorage).
async function composeSignedPolicy(opts: {
  signatureDataUrl: string;
  signerName: string;
  projectName: string | null;
  site: string | null;
  signedAtText: string;
  policyHash: string;
}): Promise<Blob> {
  const W = 820;
  const M = 40;
  const lineH = 26;
  const sig = await loadImage(opts.signatureDataUrl);
  const policyLines = POLICY.split("\n");
  const meta = [
    `שם החותם: ${opts.signerName}`,
    `תאריך ושעה: ${opts.signedAtText}`,
    opts.projectName ? `פרויקט: ${opts.projectName}` : null,
    opts.site ? `אתר: ${opts.site}` : null,
    `גרסת נוהל: ${POLICY_VERSION}`,
  ].filter(Boolean) as string[];

  const sigW = Math.min(300, sig.width || 300);
  const sigH = Math.min(130, (sig.height || 130) * (sigW / (sig.width || 300)));
  const H = M * 2 + 50 + meta.length * lineH + 20 + (policyLines.length + 1) * lineH + 20 + lineH + 24 + sigH + 40;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(H);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  const x = W - M;
  let y = M + 26;

  ctx.fillStyle = "#111";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("אישור חתימה על נוהל החזרת ציוד — ש.ב.א.", x, y);
  y += 44;
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#333";
  for (const m of meta) { ctx.fillText(m, x, y); y += lineH; }
  y += 18;
  ctx.font = "bold 15px sans-serif"; ctx.fillStyle = "#111";
  ctx.fillText("נוסח הנוהל:", x, y); y += lineH;
  ctx.font = "14px sans-serif"; ctx.fillStyle = "#222";
  for (const ln of policyLines) { ctx.fillText(ln, x, y); y += lineH; }
  y += 16;
  ctx.font = "bold 14px sans-serif"; ctx.fillStyle = "#0a7a3f";
  ctx.fillText("✓ קראתי את הנוהל ואני מאשר/ת את תוכנו.", x, y); y += lineH + 8;
  ctx.font = "13px sans-serif"; ctx.fillStyle = "#555";
  ctx.fillText("חתימה:", x, y); y += 10;
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(W - M - sigW, y, sigW, sigH);
  ctx.drawImage(sig, W - M - sigW, y, sigW, sigH);
  y += sigH + 22;
  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font = "11px monospace"; ctx.fillStyle = "#888";
  ctx.fillText(`policy v${POLICY_VERSION} · sha256:${opts.policyHash.slice(0, 40)}`, M, y);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

const PHASE_LABEL: Record<UploadPhase, string> = {
  preparing: "מכין את המסמך החתום...",
  uploading: "מעלה...",
  finalizing: "מסיים...",
};

function SignPage() {
  const token = useParams({ from: "/c/$token/sign" }).token;
  return (
    <ExternalTokenGuard token={token} expectedAction="sign_policy">
      {({ rawToken, projectName, site }) => (
        <SignForm rawToken={rawToken} projectName={projectName} site={site} />
      )}
    </ExternalTokenGuard>
  );
}

function SignForm({ rawToken, projectName, site }: { rawToken: string; projectName: string | null; site: string | null }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = phase !== null;
  const canSubmit = name.trim().length >= 2 && agreed && !!signature && !running;

  const submit = async () => {
    if (!canSubmit || !signature) return;
    setError(null);
    setPhase("preparing");
    try {
      const policyHash = await sha256Hex(POLICY);
      const signedAt = new Date();
      const blob = await composeSignedPolicy({
        signatureDataUrl: signature,
        signerName: name.trim(),
        projectName,
        site,
        signedAtText: signedAt.toLocaleString("he-IL"),
        policyHash,
      });
      const file = new File([blob], `signed-policy-${Date.now()}.png`, { type: "image/png" });
      await uploadCustomerFile({
        rawToken,
        file,
        payload: {
          signerName: name.trim(),
          agreed: true,
          policyVersion: POLICY_VERSION,
          policyHash,
          signedAt: signedAt.toISOString(),
        },
        onPhase: setPhase,
      });
      setDone(true);
      toast.success("החתימה נשמרה");
    } catch (e) {
      setError(e instanceof CustomerLinkError ? e.message : "החתימה נכשלה. נסי שוב.");
    } finally {
      setPhase(null);
    }
  };

  const subtitle = [projectName, site].filter(Boolean).join(" · ") || undefined;

  if (done) {
    return (
      <ExternalShell title="תודה!" subtitle="החתימה נקלטה במערכת">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">החתימה על נוהל ההחזרה התקבלה בהצלחה. תודה על שיתוף הפעולה.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="חתימה על נוהל החזרה" subtitle={subtitle}>
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-xs font-semibold text-muted-foreground">נוהל החזרה (גרסה {POLICY_VERSION})</p>
        <pre className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{POLICY}</pre>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signer">שם החותם *</Label>
        <Input id="signer" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={running} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>חתימה *</Label>
        <SignaturePad onChange={setSignature} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} disabled={running} />
        <span>קראתי את הנוהל ואני מאשר/ת את תוכנו.</span>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error} (ניתן לנסות שוב)</span>
        </div>
      )}

      <Button onClick={submit} disabled={!canSubmit} className="min-h-11">
        {phase ? PHASE_LABEL[phase] : "שליחת חתימה"}
      </Button>
    </ExternalShell>
  );
}
