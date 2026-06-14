import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCEPTED_MIME,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  MAX_FILE_BYTES,
  formatBytes,
  type DocumentAttachment,
  type DocumentCategory,
} from "@/lib/document-types";
import type { ScheduleSegment } from "@/lib/schedule-types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  segments: ScheduleSegment[];
  onSubmit: (data: {
    category: DocumentCategory;
    attachment: DocumentAttachment;
    file: File;
  }) => void | Promise<void>;
}

export function UploadDocumentDialog({ open, onOpenChange, segments, onSubmit }: Props) {
  const [category, setCategory] = useState<DocumentCategory>("delivery_note");
  const [attachTo, setAttachTo] = useState<string>("case"); // "case" | segmentId
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setCategory("delivery_note");
      setAttachTo("case");
      setFile(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  const handlePick = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPTED_MIME.includes(f.type)) {
      toast.error("סוג קובץ לא נתמך. אפשרי: תמונות או PDF.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`גודל הקובץ חורג מ-${formatBytes(MAX_FILE_BYTES)}`);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return toast.error("יש לבחור קובץ");
    const attachment: DocumentAttachment =
      attachTo === "case" ? { type: "case" } : { type: "segment", segmentId: attachTo };
    setBusy(true);
    try {
      await onSubmit({ category, attachment, file });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>העלאת מסמך / תמונה</DialogTitle>
          <DialogDescription>
            עד {formatBytes(MAX_FILE_BYTES)} לקובץ. תמונות (JPG/PNG/WEBP) או PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>סוג מסמך *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {DOCUMENT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>שיוך</Label>
            <Select value={attachTo} onValueChange={setAttachTo}>
              <SelectTrigger>
                <SelectValue placeholder="בחרי שיוך" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="case">כללי לתיק</SelectItem>
                {segments.map((s, i) => (
                  <SelectItem key={s.id} value={s.id}>
                    משאית {i + 1}
                    {s.truckId ? ` · ${s.truckId}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-file">קובץ *</Label>
            <Input
              id="doc-file"
              ref={inputRef}
              type="file"
              accept={ACCEPTED_MIME.join(",")}
              onChange={(e) => handlePick(e.target.files?.[0])}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !file} className="gap-2">
            <Upload className="h-4 w-4" />
            {busy ? "מעלה…" : "העלה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
