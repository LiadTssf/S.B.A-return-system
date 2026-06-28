// שירות העלאת קובץ לקוח (Supabase מצד-לקוח): בקשת signed-upload-URL מה-Edge Function
// request-customer-upload → uploadToSignedUrl → submit_customer_action.
// אין כתיבת Storage ישירה (anon חסום); אין Base64/קובץ/טוקן ב-localStorage.
import { getSupabase } from "@/lib/supabase";
import {
  supabaseCustomerLinksAdapter,
  CustomerLinkError,
} from "@/adapters/supabaseCustomerLinksAdapter";
import type { DocumentCategory } from "@/lib/document-types";

export type UploadPhase = "preparing" | "uploading" | "finalizing";

// allowlist ל-MIME לפי סוג מסמך — זהה ל-Edge Function ול-submit_customer_action.
export const MIME_BY_DOCTYPE: Record<string, string[]> = {
  truck_photo: ["image/jpeg", "image/png", "image/webp"],
  signed_policy: ["application/pdf", "image/png", "image/jpeg"],
  delivery_note: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  return_certificate: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  other: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export function allowedMime(docType: DocumentCategory | null | undefined): string[] {
  return (docType && MIME_BY_DOCTYPE[docType]) || MIME_BY_DOCTYPE.other;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "הקישור אינו תקין.",
  expired_token: "הקישור פג תוקף.",
  used_token: "הקישור כבר נוצל.",
  revoked_token: "הקישור בוטל.",
  token_not_usable: "הקישור אינו זמין לשימוש.",
  action_not_allowed: "הקישור אינו מיועד להעלאת קובץ.",
  document_type_not_set: "סוג המסמך אינו מוגדר בקישור.",
  mime_not_allowed: "סוג הקובץ אינו נתמך עבור מסמך זה.",
  file_too_large: "הקובץ חורג מהגודל המרבי (15MB).",
  invalid_size: "גודל קובץ לא תקין.",
  missing_mime: "סוג קובץ חסר.",
  origin_not_allowed: "מקור הבקשה אינו מורשה.",
  sign_url_failed: "יצירת כתובת ההעלאה נכשלה. נסי שוב.",
  server_error: "שגיאת שרת זמנית. נסי שוב.",
  bad_request: "בקשה לא תקינה.",
};
function msgFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || "אירעה שגיאה. נסי שוב.";
}

/**
 * זרימת העלאה מאובטחת: preparing → uploading → finalizing.
 * כשל בכל שלב זורק CustomerLinkError; הטוקן נצרך רק ב-submit (DB), לכן כשל לפני/בזמן
 * submit משאיר את הטוקן active (ניתן לנסות שוב — הנתיב דטרמיניסטי ונדרס).
 */
export async function uploadCustomerFile(opts: {
  rawToken: string;
  file: File;
  payload?: Record<string, unknown>;
  onPhase?: (p: UploadPhase) => void;
}): Promise<{ ok: true; status: "auto_applied" | "pending_review" }> {
  const sb = getSupabase();

  // 1) בקשת URL חתום מה-Edge Function (לא צורך את טוקן הלקוח).
  //    שולחים רק mime/size — שם הקובץ אינו נדרש להרשאה/לנתיב; הוא נשלח כמטא-דאטה ל-submit.
  opts.onPhase?.("preparing");
  const { data, error } = await sb.functions.invoke("request-customer-upload", {
    body: { token: opts.rawToken, mimeType: opts.file.type, sizeBytes: opts.file.size },
  });
  if (error) throw new CustomerLinkError("business", "בקשת ההעלאה נכשלה. נסי שוב.");
  const res = data as { ok?: boolean; error?: string; bucket?: string; path?: string; uploadToken?: string };
  if (!res?.ok) throw new CustomerLinkError("file_validation", msgFor(res?.error));
  if (!res.bucket || !res.path || !res.uploadToken) throw new CustomerLinkError("shape", "תשובת שרת לא תקינה.");

  // 2) העלאה ל-URL החתום (הרשאה דרך uploadToken — לא טוקן הלקוח, לא RLS ישיר).
  opts.onPhase?.("uploading");
  const up = await sb.storage
    .from(res.bucket)
    .uploadToSignedUrl(res.path, res.uploadToken, opts.file, { contentType: opts.file.type });
  if (up.error) throw new CustomerLinkError("business", "העלאת הקובץ נכשלה. נסי שוב.");

  // 3) סופיות רק לאחר העלאה מוצלחת — submit מאמת אובייקט וצורך את הטוקן (אטומי).
  opts.onPhase?.("finalizing");
  const submitted = await supabaseCustomerLinksAdapter.submitAction(
    opts.rawToken,
    { ...(opts.payload ?? {}), fileName: opts.file.name },
    res.path,
  );
  return { ok: true, status: submitted.status };
}
