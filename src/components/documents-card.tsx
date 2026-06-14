import { useState } from "react";
import { FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useRole } from "@/hooks/use-role";
import { useCaseDocuments } from "@/hooks/use-documents";
import { useDocUrl } from "@/hooks/use-doc-url";
import { useSchedule } from "@/hooks/use-schedule";
import {
  can,
  CAN_UPLOAD_DOCUMENT,
  CAN_DELETE_DOCUMENT,
  CAN_VIEW_DOCUMENTS,
} from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import {
  DOCUMENT_CATEGORY_LABELS,
  docDisplayName,
  formatBytes,
  isImage,
  type CaseDocument,
  type DocumentCategory,
} from "@/lib/document-types";
import type { AuditAction } from "@/lib/audit-types";
import { documentsAdapter, auditAdapter } from "@/adapters";
import { toast } from "sonner";
import { UploadDocumentDialog } from "./upload-document-dialog";

interface Props {
  caseId: string;
  isClosed: boolean;
  caseCreatedBy: string;
}

// audit ספציפי לפי סוג מסמך
const TYPE_AUDIT: Partial<Record<DocumentCategory, AuditAction>> = {
  delivery_note: "delivery_note_uploaded",
  return_certificate: "return_certificate_uploaded",
  truck_photo: "truck_photo_uploaded",
  signed_policy: "signed_policy_uploaded",
};

export function DocumentsCard({ caseId, isClosed, caseCreatedBy }: Props) {
  const role = useRole();
  const docs = useCaseDocuments(caseId);
  const schedule = useSchedule(caseId);
  const segments = schedule?.segments ?? [];
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CaseDocument | null>(null);
  const [preview, setPreview] = useState<CaseDocument | null>(null);

  if (!can(role, CAN_VIEW_DOCUMENTS)) return null;

  const canUpload = !isClosed && can(role, CAN_UPLOAD_DOCUMENT);
  const canDelete = !isClosed && can(role, CAN_DELETE_DOCUMENT);

  const openPreview = (d: CaseDocument) => {
    setPreview(d);
    auditAdapter.log("document_viewed", {
      caseId,
      detail: `${DOCUMENT_CATEGORY_LABELS[d.category]} · ${docDisplayName(d)}`,
    });
  };

  const generalDocs = docs.filter((d) => d.attachment.type === "case");
  const docsBySegment = (segId: string) =>
    docs.filter((d) => d.attachment.type === "segment" && d.attachment.segmentId === segId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">מסמכים ותמונות</CardTitle>
        {canUpload && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 gap-1"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-4 w-4" />
            העלאת קובץ
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            לא הועלו עדיין מסמכים או תמונות לתיק זה.
          </p>
        ) : (
          <>
            {segments.map((seg, i) => {
              const segDocs = docsBySegment(seg.id);
              if (segDocs.length === 0) return null;
              return (
                <div key={seg.id} className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">
                    משאית {i + 1}
                    {seg.truckId && (
                      <span className="mr-1 text-xs font-normal text-muted-foreground" dir="ltr">
                        · {seg.truckId}
                      </span>
                    )}
                  </h4>
                  <DocList
                    docs={segDocs}
                    canDelete={canDelete}
                    onPreview={openPreview}
                    onDelete={setToDelete}
                  />
                </div>
              );
            })}
            {generalDocs.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">כללי לתיק</h4>
                <DocList
                  docs={generalDocs}
                  canDelete={canDelete}
                  onPreview={openPreview}
                  onDelete={setToDelete}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        segments={segments}
        onSubmit={async (input) => {
          try {
            const doc = await documentsAdapter.add({
              caseId,
              category: input.category,
              attachment: input.attachment,
              file: input.file,
              fileName: input.file.name,
              title: input.title,
              mimeType: input.file.type,
              sizeBytes: input.file.size,
              uploadedBy: caseCreatedBy || ROLE_LABELS[role],
              uploadedByRole: ROLE_LABELS[role],
            });
            const detail = `${DOCUMENT_CATEGORY_LABELS[doc.category]} · ${docDisplayName(doc)}`;
            await auditAdapter.log("document_uploaded", { caseId, detail });
            const specific = TYPE_AUDIT[doc.category];
            if (specific) await auditAdapter.log(specific, { caseId, detail });
            toast.success("הקובץ הועלה");
            setUploadOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "שגיאה בהעלאה");
          }
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קובץ</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את "{toDelete ? docDisplayName(toDelete) : ""}"? לא ניתן לשחזר פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!toDelete) return;
                await documentsAdapter.remove(toDelete.id);
                auditAdapter.log("delete_document", {
                  caseId,
                  detail: `${DOCUMENT_CATEGORY_LABELS[toDelete.category]} · ${docDisplayName(toDelete)}`,
                });
                toast.success("הקובץ נמחק");
                setToDelete(null);
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          {preview && <DocPreview doc={preview} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DocList({
  docs,
  canDelete,
  onPreview,
  onDelete,
}: {
  docs: CaseDocument[];
  canDelete: boolean;
  onPreview: (d: CaseDocument) => void;
  onDelete: (d: CaseDocument) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {docs.map((d) => (
        <DocRow
          key={d.id}
          doc={d}
          canDelete={canDelete}
          onPreview={onPreview}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function DocRow({
  doc: d,
  canDelete,
  onPreview,
  onDelete,
}: {
  doc: CaseDocument;
  canDelete: boolean;
  onPreview: (d: CaseDocument) => void;
  onDelete: (d: CaseDocument) => void;
}) {
  const url = useDocUrl(isImage(d.mimeType) ? d : null);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2">
      <button
        type="button"
        onClick={() => onPreview(d)}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background"
        aria-label={`צפייה ב-${docDisplayName(d)}`}
      >
        {isImage(d.mimeType) && url ? (
          <img src={url} alt={d.fileName} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onPreview(d)}
          className="truncate text-right text-sm font-medium hover:underline"
        >
          {docDisplayName(d)}
        </button>
        {d.title?.trim() && (
          <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
            {d.fileName}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1 font-normal">
            {isImage(d.mimeType) ? (
              <ImageIcon className="h-3 w-3" />
            ) : (
              <Paperclip className="h-3 w-3" />
            )}
            {DOCUMENT_CATEGORY_LABELS[d.category]}
          </Badge>
          <span>{formatBytes(d.sizeBytes)}</span>
          {d.uploadedByRole && (
            <>
              <span>·</span>
              <span>{d.uploadedByRole}</span>
            </>
          )}
        </div>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(d)}
          aria-label={`מחק ${d.fileName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

function DocPreview({ doc }: { doc: CaseDocument }) {
  const url = useDocUrl(doc);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold">{docDisplayName(doc)}</h3>
        <p className="text-xs text-muted-foreground">
          {DOCUMENT_CATEGORY_LABELS[doc.category]} · {doc.fileName} · {formatBytes(doc.sizeBytes)}
        </p>
      </div>
      {!url ? (
        <div className="p-6 text-center text-sm text-muted-foreground">טוען…</div>
      ) : isImage(doc.mimeType) ? (
        <img
          src={url}
          alt={doc.fileName}
          className="max-h-[70vh] w-full rounded-md object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/30 p-6">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm">{doc.fileName}</p>
          <Button asChild>
            <a href={url} target="_blank" rel="noreferrer" download={doc.fileName}>
              פתיחה / הורדה
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
