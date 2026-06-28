import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowedMime, MAX_UPLOAD_BYTES, uploadCustomerFile, type UploadPhase } from "@/lib/customer-upload";
import { CustomerLinkError } from "@/adapters/supabaseCustomerLinksAdapter";
import { DOCUMENT_CATEGORY_LABELS, formatBytes, type DocumentCategory } from "@/lib/document-types";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$token/upload")({
  head: () => ({ meta: [{ title: "העלאת תעודה — ש.ב.א." }] }),
  component: UploadPage,
});

const PHASE_LABEL: Record<UploadPhase, string> = {
  preparing: "מכין העלאה...",
  uploading: "מעלה...",
  finalizing: "מסיים...",
};

function UploadPage() {
  const token = useParams({ from: "/c/$token/upload" }).token;
  return (
    <ExternalTokenGuard token={token} expectedAction="upload_doc">
      {({ rawToken, documentType, projectName, site }) => (
        <UploadForm rawToken={rawToken} documentType={documentType} projectName={projectName} site={site} />
      )}
    </ExternalTokenGuard>
  );
}

function UploadForm({
  rawToken,
  documentType,
  projectName,
  site,
}: {
  rawToken: string;
  documentType: DocumentCategory | null;
  projectName: string | null;
  site: string | null;
}) {
  const accepted = allowedMime(documentType);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = phase !== null;

  const pick = (f?: File) => {
    if (!f) return;
    if (!accepted.includes(f.type)) { toast.error("סוג קובץ לא נתמך עבור מסמך זה"); return; }
    if (f.size > MAX_UPLOAD_BYTES) { toast.error(`הקובץ חורג מ-${formatBytes(MAX_UPLOAD_BYTES)}`); return; }
    setError(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file || running) return;
    setError(null);
    try {
      await uploadCustomerFile({ rawToken, file, payload: { title: file.name }, onPhase: setPhase });
      setDone(true);
      toast.success("הקובץ הועלה");
    } catch (e) {
      setError(e instanceof CustomerLinkError ? e.message : "ההעלאה נכשלה. נסי שוב.");
    } finally {
      setPhase(null);
    }
  };

  const subtitle = [projectName, site].filter(Boolean).join(" · ") || undefined;
  const docLabel = documentType ? DOCUMENT_CATEGORY_LABELS[documentType] : "מסמך";

  if (done) {
    return (
      <ExternalShell title="תודה!" subtitle="המסמך התקבל">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">המסמך נשמר בתיק וממתין לבדיקת הצוות. נעדכן לאחר האישור.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="העלאת מסמך" subtitle={subtitle}>
      <div className="rounded-md border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">סוג המסמך המבוקש: </span>
        <span className="font-medium">{docLabel}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">קובץ *</Label>
        <Input id="file" type="file" accept={accepted.join(",")} onChange={(e) => pick(e.target.files?.[0])} disabled={running} />
        {file && <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
        <p className="text-xs text-muted-foreground">PDF או תמונה (JPG/PNG/WEBP), עד {formatBytes(MAX_UPLOAD_BYTES)}.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error} {`(ניתן לנסות שוב)`}</span>
        </div>
      )}

      <Button onClick={submit} disabled={!file || running} className="min-h-11 gap-2">
        <Upload className="h-4 w-4" />
        {phase ? PHASE_LABEL[phase] : "העלה"}
      </Button>
    </ExternalShell>
  );
}
