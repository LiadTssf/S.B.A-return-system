// Mock adapter למסמכים — נתוני דמה ב-localStorage (Base64 data URL).
// TODO: Replace this adapter with Supabase Storage implementation
//       (העלאת קובץ אמיתי + שמירת metadata בטבלת case_documents + signed URL).
import * as store from "./mock/documents-store";
import type { CaseDocument } from "@/lib/document-types";

export const DOCUMENTS_EVENT = store.DOCUMENTS_EVENT;
export type { AddDocumentInput } from "./mock/documents-store";

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
  async hasReturnCertificate(caseId: string, segmentId: string): Promise<boolean> {
    return store.hasReturnCertificate(caseId, segmentId);
  },
  async hasTruckPhoto(caseId: string, segmentId?: string): Promise<boolean> {
    return store.hasTruckPhoto(caseId, segmentId);
  },
  async caseBytes(caseId: string): Promise<number> {
    return store.getCaseBytes(caseId);
  },
  async add(input: store.AddDocumentInput): Promise<CaseDocument> {
    return store.addDocument(input);
  },
  async remove(id: string): Promise<void> {
    store.removeDocument(id);
  },
  async removeForSegment(caseId: string, segmentId: string): Promise<void> {
    store.removeDocumentsForSegment(caseId, segmentId);
  },
  /**
   * החזרת URL לצפייה/הורדה. במימוש ה-mock זהו ה-dataUrl (Base64).
   * TODO: ב-Supabase יוחזר signed URL מ-Storage.
   */
  async getViewUrl(doc: CaseDocument): Promise<string> {
    return doc.dataUrl;
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
