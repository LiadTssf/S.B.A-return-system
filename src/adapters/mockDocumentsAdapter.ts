// Mock adapter למסמכים — localStorage + Base64. בשימוש רק כשאין Supabase.
import * as store from "./mock/documents-store";
import type { AddDocumentInput, CaseDocument } from "@/lib/document-types";

export const DOCUMENTS_EVENT = store.DOCUMENTS_EVENT;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const mockDocumentsAdapter = {
  async listAll(): Promise<CaseDocument[]> {
    return store.getAllDocuments();
  },
  async listForCase(caseId: string): Promise<CaseDocument[]> {
    return store.getCaseDocuments(caseId);
  },
  async listForSegment(caseId: string, segmentId: string): Promise<CaseDocument[]> {
    return store.getSegmentDocuments(caseId, segmentId);
  },
  async hasReturnCertificate(caseId: string, _segmentId?: string): Promise<boolean> {
    return store.hasReturnCertificate(caseId);
  },
  async hasTruckPhoto(caseId: string, _segmentId?: string): Promise<boolean> {
    return store.hasTruckPhoto(caseId);
  },
  async caseBytes(caseId: string): Promise<number> {
    return store.getCaseBytes(caseId);
  },
  async add(input: AddDocumentInput): Promise<CaseDocument> {
    const dataUrl = await fileToDataUrl(input.file);
    const doc: CaseDocument = {
      id: crypto.randomUUID(),
      caseId: input.caseId,
      title: input.title?.trim() || "",
      category: input.category,
      attachment: input.attachment,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedAt: new Date().toISOString(),
      uploadedBy: input.uploadedBy,
      uploadedByRole: input.uploadedByRole,
      storageProvider: "mock",
      dataUrl,
    };
    return store.addDocument(doc);
  },
  async remove(id: string): Promise<void> {
    store.removeDocument(id);
  },
  async removeForSegment(caseId: string, segmentId: string): Promise<void> {
    store.removeDocumentsForSegment(caseId, segmentId);
  },
  /** mock — מחזיר את ה-dataUrl (Base64). */
  async getViewUrl(doc: CaseDocument): Promise<string> {
    return doc.dataUrl ?? "";
  },
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(DOCUMENTS_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(DOCUMENTS_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type DocumentsAdapter = typeof mockDocumentsAdapter;
