// סוגי מסמך — תואם ל-case_documents.document_type ב-Supabase.
export type DocumentCategory =
  | "delivery_note"
  | "return_certificate"
  | "truck_photo"
  | "signed_policy"
  | "other";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  delivery_note: "תעודת משלוח",
  return_certificate: "תעודת החזרה",
  truck_photo: "תמונת משאית",
  signed_policy: "נוהל חתום",
  other: "מסמך אחר",
};

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "delivery_note",
  "return_certificate",
  "truck_photo",
  "signed_policy",
  "other",
];

/** שיוך מסמך: למשאית מסוימת (id של סגמנט) או כללי לתיק */
export type DocumentAttachment =
  | { type: "segment"; segmentId: string }
  | { type: "case" };

export interface CaseDocument {
  id: string;
  caseId: string;
  /** שם תצוגה ידידותי (אופציונלי). אם ריק — מציגים את fileName (ראה docDisplayName). */
  title: string;
  category: DocumentCategory;
  attachment: DocumentAttachment;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByRole: string;
  // ── אחסון אמיתי (Supabase Storage) ──
  storageProvider?: string;
  bucketName?: string;
  objectPath?: string;
  // ── fallback mock בלבד (Base64) ──
  dataUrl?: string;
}

/** קלט להעלאת מסמך — הקובץ עצמו עולה ל-Storage; ה-metadata לטבלה. */
export interface AddDocumentInput {
  caseId: string;
  category: DocumentCategory;
  attachment: DocumentAttachment;
  file: File;
  fileName: string;
  /** שם תצוגה ידידותי (אופציונלי). אם ריק — תוצג שם הקובץ. */
  title?: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByRole: string;
}

/** שם התצוגה של מסמך: כותרת אם קיימת, אחרת שם הקובץ. */
export function docDisplayName(doc: { title?: string; fileName: string }): string {
  const t = doc.title?.trim();
  return t && t.length > 0 ? t : doc.fileName;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB לקובץ
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** הופך שם קובץ לבטוח כמפתח אחסון (ASCII). השם המקורי נשמר ב-metadata. */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]/g, "") : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return (base || "file") + ext;
}
