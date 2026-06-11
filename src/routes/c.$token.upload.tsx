import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { ExternalShell } from "@/components/external-shell";
import { ExternalTokenGuard } from "@/components/external-token-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerLinksAdapter, documentsAdapter, auditAdapter } from "@/adapters";
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  formatBytes,
} from "@/lib/document-types";
import { toast } from "sonner";
import type { CustomerLinkToken } from "@/lib/customer-link-types";

export const Route = createFileRoute("/c/$token/upload")({
  head: () => ({ meta: [{ title: "העלאת תעודה — ש.ב.א." }] }),
  component: UploadPage,
});

// TODO: Replace base64 with Supabase Storage upload + signed URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function UploadPage() {
  return (
    <ExternalTokenGuard
      token={useParams({ from: "/c/$token/upload" }).token}
      expectedAction="upload_doc"
    >
      {({ token, caseData }) => (
        <UploadForm token={token} customer={caseData.customer} />
      )}
    </ExternalTokenGuard>
  );
}

function UploadForm({ token, customer }: { token: CustomerLinkToken; customer: string }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const pick = (f?: File) => {
    if (!f) return;
    if (!ACCEPTED_MIME.includes(f.type)) return toast.error("סוג קובץ לא נתמך");
    if (f.size > MAX_FILE_BYTES) return toast.error(`הקובץ חורג מ-${formatBytes(MAX_FILE_BYTES)}`);
    setFile(f);
  };

  const submit = async () => {
    if (!file || !title.trim()) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const doc = await documentsAdapter.add({
        caseId: token.caseId,
        title: title.trim(),
        category: "return_certificate",
        attachment: token.segmentId
          ? { type: "segment", segmentId: token.segmentId }
          : { type: "case" },
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
        uploadedBy: "לקוח חיצוני",
        uploadedByRole: "לקוח חיצוני",
      });
      await customerLinksAdapter.addSubmission({
        token: token.token,
        caseId: token.caseId,
        action: "upload_doc",
        payload: { type: "upload_doc", documentId: doc.id, title: title.trim() },
      });
      auditAdapter.log("customer_doc_uploaded", { caseId: token.caseId, detail: title.trim() });
      setDone(true);
      toast.success("הקובץ הועלה");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "העלאה נכשלה");
    }
  };

  if (done) {
    return (
      <ExternalShell title="תודה!" subtitle="התעודה התקבלה במערכת">
        <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/10 p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-sm">הקובץ נשמר בתיק. תודה.</p>
        </div>
      </ExternalShell>
    );
  }

  return (
    <ExternalShell title="העלאת תעודת משלוח" subtitle={`לקוח: ${customer}`}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">כותרת *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="לדוגמה: תעודת משלוח 4523"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">קובץ *</Label>
        <Input
          id="file"
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file && (
          <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>
        )}
        <p className="text-xs text-muted-foreground">תמונה (JPG/PNG/WEBP) או PDF, עד {formatBytes(MAX_FILE_BYTES)}.</p>
      </div>
      <Button onClick={submit} disabled={!file || !title.trim()} className="min-h-11 gap-2">
        <Upload className="h-4 w-4" />
        העלה
      </Button>
    </ExternalShell>
  );
}
