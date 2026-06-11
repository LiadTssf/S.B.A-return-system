import type { CaseDocument, DocumentAttachment, DocumentCategory } from "@/lib/document-types";
import { MAX_CASE_BYTES } from "@/lib/document-types";

const STORAGE_KEY = "sba.documents";
const EVENT = "sba.documents.changed";

export const DOCUMENTS_EVENT = EVENT;

function read(): CaseDocument[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as CaseDocument[];
  } catch {
    return [];
  }
}

function write(docs: CaseDocument[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  window.dispatchEvent(new Event(EVENT));
}

export function getAllDocuments(): CaseDocument[] {
  return read();
}

export function getCaseDocuments(caseId: string): CaseDocument[] {
  return read().filter((d) => d.caseId === caseId);
}

export function getSegmentDocuments(caseId: string, segmentId: string): CaseDocument[] {
  return read().filter(
    (d) => d.caseId === caseId && d.attachment.type === "segment" && d.attachment.segmentId === segmentId,
  );
}

/** האם קיימת תעודת החזרה למשאית */
export function hasReturnCertificate(caseId: string, segmentId: string): boolean {
  return read().some(
    (d) =>
      d.caseId === caseId &&
      d.category === "return_certificate" &&
      d.attachment.type === "segment" &&
      d.attachment.segmentId === segmentId,
  );
}

/** האם קיימת תמונת משאית כלשהי לתיק (כללי או לסגמנט) */
export function hasTruckPhoto(caseId: string, segmentId?: string): boolean {
  return read().some(
    (d) =>
      d.caseId === caseId &&
      d.category === "truck_photo" &&
      (segmentId
        ? (d.attachment.type === "case" ||
          (d.attachment.type === "segment" && d.attachment.segmentId === segmentId))
        : true),
  );
}

export function getCaseBytes(caseId: string): number {
  return getCaseDocuments(caseId).reduce((sum, d) => sum + d.sizeBytes, 0);
}

export interface AddDocumentInput {
  caseId: string;
  title: string;
  category: DocumentCategory;
  attachment: DocumentAttachment;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedBy: string;
  uploadedByRole: string;
}

export function addDocument(input: AddDocumentInput): CaseDocument {
  const used = getCaseBytes(input.caseId);
  if (used + input.sizeBytes > MAX_CASE_BYTES) {
    throw new Error("חריגה ממכסת הקבצים לתיק (עד 5MB סך הכל באבטיפוס)");
  }
  const doc: CaseDocument = {
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
    ...input,
  };
  const all = read();
  all.push(doc);
  write(all);
  return doc;
}

export function mergeDocuments(items: CaseDocument[]) {
  if (items.length === 0) return;
  const merged = new Map<string, CaseDocument>();
  for (const item of read()) merged.set(item.id, item);
  for (const item of items) merged.set(item.id, item);
  write(Array.from(merged.values()));
}

export function removeDocument(id: string): void {
  write(read().filter((d) => d.id !== id));
}

/** מוחק מסמכים המשויכים לסגמנט שנמחק (cascade) */
export function removeDocumentsForSegment(caseId: string, segmentId: string): void {
  write(
    read().filter(
      (d) =>
        !(d.caseId === caseId && d.attachment.type === "segment" && d.attachment.segmentId === segmentId),
    ),
  );
}