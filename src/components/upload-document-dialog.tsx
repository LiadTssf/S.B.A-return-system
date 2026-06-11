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
    title: string;
    category: DocumentCategory;
    attachment: DocumentAttachment;
    file: File;
    dataUrl: string;
  }) => void;
}

// TODO: Replace base64 with Supabase Storage upload + signed URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function UploadDocumentDialog({ open, onOpenChange, segments, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("cargo_photo");
  const [attachTo, setAttachTo] = useState<string>("case"); // "case" | segmentId
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setCategory("cargo_photo");
      setAttachTo(segments[0]?.id ?? "case");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open, segments]);

  // תעודת החזרה חייבת להיות משויכת למשאית
  const mustAttachToSegment = category === "return_certificate";
  const segmentRequired = mustAttachToSegment && segments.length === 0;

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
    if (!title.trim()) return toast.error("יש להזין כותרת לקובץ");
    if (!file) return toast.error("יש לבחור קובץ");
    if (mustAttachToSegment && (attachTo === "case" || !attachTo)) {
      return toast.error("תעודת החזרה חייבת להיות משויכת למשאית מסוימת");
    }
    const dataUrl = await fileToDataUrl(file);
    const attachment: DocumentAttachment =
      attachTo === "case" ? { type: "case" } : { type: "segment", segmentId: attachTo };
    onSubmit({ title: title.trim(), category, attachment, file, dataUrl });
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
            <Label htmlFor="doc-title">כותרת *</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: תוכן משאית בעת העמסה"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>קטגוריה *</Label>
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
            <Label>שיוך *</Label>
            <Select value={attachTo} onValueChange={setAttachTo}>
              <SelectTrigger>
                <SelectValue placeholder="בחרי שיוך" />
              </SelectTrigger>
              <SelectContent>
                {!mustAttachToSegment && <SelectItem value="case">כללי לתיק</SelectItem>}
                {segments.map((s, i) => (
                  <SelectItem key={s.id} value={s.id}>
                    משאית {i + 1}
                    {s.truckId ? ` · ${s.truckId}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {segmentRequired && (
              <p className="text-xs text-destructive">
                אין משאיות בתיק. יש להוסיף משאית לפני העלאת תעודת החזרה.
              </p>
            )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={segmentRequired} className="gap-2">
            <Upload className="h-4 w-4" />
            העלה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
