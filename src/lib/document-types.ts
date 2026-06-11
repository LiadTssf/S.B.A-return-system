export type DocumentCategory =
  | "cargo_photo"
  | "truck_photo"
  | "return_certificate"
  | "general";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  cargo_photo: "תמונת תוכן משאית",
  truck_photo: "תמונת משאית",
  return_certificate: "תעודת החזרה",
  general: "מסמך כללי / אחר",
};

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "cargo_photo",
  "truck_photo",
  "return_certificate",
  "general",
];

/** שיוך מסמך: למשאית מסוימת (id של סגמנט) או כללי לתיק */
export type DocumentAttachment =
  | { type: "segment"; segmentId: string }
  | { type: "case" };

export interface CaseDocument {
  id: string;
  caseId: string;
  title: string;
  category: DocumentCategory;
  attachment: DocumentAttachment;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Base64 data URL — אבטיפוס בלבד */
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByRole: string;
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_CASE_BYTES = 5 * 1024 * 1024; // 5MB total per case
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}