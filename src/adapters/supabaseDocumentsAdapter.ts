// Supabase adapter למסמכים — קובץ אמיתי ב-Storage (bucket: case-documents)
// + metadata בטבלת case_documents. צפייה/הורדה דרך signed URL.
import { getSupabase } from "@/lib/supabase";
import {
  safeStorageName,
  type AddDocumentInput,
  type CaseDocument,
} from "@/lib/document-types";

export const DOCUMENTS_EVENT = "sba.documents.changed";
const BUCKET = "case-documents";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DOCUMENTS_EVENT));
}

function toDoc(r: any): CaseDocument {
  return {
    id: r.id,
    caseId: r.return_case_id,
    title: r.title ?? "", // אם NULL — התצוגה תיפול חזרה ל-fileName (docDisplayName)
    category: r.document_type,
    attachment: r.segment_id
      ? { type: "segment", segmentId: r.segment_id }
      : { type: "case" },
    fileName: r.file_name,
    mimeType: r.mime_type ?? "",
    sizeBytes: r.size_bytes ?? 0,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by ?? "",
    uploadedByRole: r.uploaded_by ?? "",
    storageProvider: r.storage_provider ?? "supabase",
    bucketName: r.bucket_name ?? BUCKET,
    objectPath: r.object_path,
  };
}

export const supabaseDocumentsAdapter = {
  async listAll(): Promise<CaseDocument[]> {
    const sb = getSupabase();
    const { data, error } = await sb.from("case_documents").select("*");
    if (error) throw error;
    return (data ?? []).map(toDoc);
  },
  async listForCase(caseId: string): Promise<CaseDocument[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("case_documents")
      .select("*")
      .eq("return_case_id", caseId)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toDoc);
  },
  async listForSegment(caseId: string, segmentId: string): Promise<CaseDocument[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("case_documents")
      .select("*")
      .eq("return_case_id", caseId)
      .eq("segment_id", segmentId);
    if (error) throw error;
    return (data ?? []).map(toDoc);
  },
  async hasReturnCertificate(caseId: string, _segmentId?: string): Promise<boolean> {
    const sb = getSupabase();
    const { count, error } = await sb
      .from("case_documents")
      .select("id", { count: "exact", head: true })
      .eq("return_case_id", caseId)
      .in("document_type", ["return_certificate", "delivery_note"]);
    if (error) throw error;
    return (count ?? 0) > 0;
  },
  async hasTruckPhoto(caseId: string, _segmentId?: string): Promise<boolean> {
    const sb = getSupabase();
    const { count, error } = await sb
      .from("case_documents")
      .select("id", { count: "exact", head: true })
      .eq("return_case_id", caseId)
      .eq("document_type", "truck_photo");
    if (error) throw error;
    return (count ?? 0) > 0;
  },
  async caseBytes(caseId: string): Promise<number> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("case_documents")
      .select("size_bytes")
      .eq("return_case_id", caseId);
    if (error) throw error;
    return (data ?? []).reduce((s: number, r: any) => s + (r.size_bytes ?? 0), 0);
  },
  async add(input: AddDocumentInput): Promise<CaseDocument> {
    const sb = getSupabase();
    const ts = Date.now();
    const objectPath = `${input.caseId}/${input.category}/${ts}-${safeStorageName(input.fileName)}`;

    // 1) העלאת הקובץ האמיתי ל-Storage
    const up = await sb.storage.from(BUCKET).upload(objectPath, input.file, {
      contentType: input.mimeType || undefined,
      upsert: false,
    });
    if (up.error) throw up.error;

    // 2) שמירת metadata בטבלה
    const segmentId =
      input.attachment.type === "segment" ? input.attachment.segmentId : null;
    const { data, error } = await sb
      .from("case_documents")
      .insert({
        return_case_id: input.caseId,
        segment_id: segmentId,
        document_type: input.category,
        file_name: input.fileName,
        title: input.title?.trim() || null,
        storage_provider: "supabase",
        bucket_name: BUCKET,
        object_path: objectPath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        uploaded_by: input.uploadedBy,
      })
      .select()
      .single();

    if (error) {
      // rollback — לא להשאיר קובץ יתום ב-Storage
      await sb.storage.from(BUCKET).remove([objectPath]);
      throw error;
    }
    emit();
    return toDoc(data);
  },
  async remove(id: string): Promise<void> {
    const sb = getSupabase();
    const { data: row } = await sb
      .from("case_documents")
      .select("object_path")
      .eq("id", id)
      .maybeSingle();
    if (row?.object_path) {
      await sb.storage.from(BUCKET).remove([row.object_path]);
    }
    const { error } = await sb.from("case_documents").delete().eq("id", id);
    if (error) throw error;
    emit();
  },
  async removeForSegment(caseId: string, segmentId: string): Promise<void> {
    const sb = getSupabase();
    const { data: rows } = await sb
      .from("case_documents")
      .select("id, object_path")
      .eq("return_case_id", caseId)
      .eq("segment_id", segmentId);
    const paths = (rows ?? []).map((r: any) => r.object_path).filter(Boolean);
    if (paths.length > 0) await sb.storage.from(BUCKET).remove(paths);
    const { error } = await sb
      .from("case_documents")
      .delete()
      .eq("return_case_id", caseId)
      .eq("segment_id", segmentId);
    if (error) throw error;
    emit();
  },
  /** signed URL לצפייה/הורדה (תקף שעה). */
  async getViewUrl(doc: CaseDocument): Promise<string> {
    if (!doc.objectPath) return "";
    const sb = getSupabase();
    const { data, error } = await sb.storage
      .from(doc.bucketName ?? BUCKET)
      .createSignedUrl(doc.objectPath, 3600);
    if (error) throw error;
    return data?.signedUrl ?? "";
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

export type SupabaseDocumentsAdapter = typeof supabaseDocumentsAdapter;
