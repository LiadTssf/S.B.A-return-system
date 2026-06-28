// Edge Function: request-customer-upload
// מנפיק signed-upload-URL לנתיב דטרמיניסטי אחד, הנגזר מטוקן הלקוח החד-פעמי בלבד.
// רץ על Deno (Supabase Edge). ה-service key מוזרק ע"י הפלטפורמה — לעולם לא בקליינט/git/לוג.
//
// בקשה (POST JSON): { token, mimeType, sizeBytes }  ← בלבד.
//   אינו מקבל/סומך על: fileName, caseId, customerId, projectId, bucket, documentType, action, path.
// תשובה (HTTP 200): הצלחה { ok:true, bucket, path, uploadToken } ; כשל { ok:false, error:"<code>" }.
//   uploadToken = הטוקן ל-uploadToSignedUrl (אסור לבלבל עם טוקן הלקוח). origin אסור → 403 ; method → 405.
//
// אינו: צורך את טוקן הלקוח · מחזיר/מתעד service key/טוקנים/Authorization · נופל ל-'other' לסוג לא-מוכר.
// ייבוא מפורש תואם-Dashboard (npm: specifier) — זהה לגרסה הפרוסה. (deno.json נשאר כגיבוי מקומי.)
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const BUCKET = "case-documents";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB (זהה ל-submit_customer_action)
const MAX_BODY_BYTES = 4 * 1024; // גוף JSON זעיר (token+mime+number)
// allowlist מפורש של MIME לפי סוג מסמך — חייב מפתח מפורש (אין fallback ל-'other').
const MIME_BY_DOCTYPE: Record<string, string[]> = {
  truck_photo: ["image/jpeg", "image/png", "image/webp"],
  signed_policy: ["application/pdf", "image/png", "image/jpeg"],
  delivery_note: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  return_certificate: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  other: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  // מחזיר את ה-origin רק אם הוא ב-allowlist; אחרת ACAO ריק (אין '*', אין echo לאחר).
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403, origin);

  // הגנת abuse: גוף JSON זעיר בלבד.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "bad_request" }, 200, origin);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_request" }, 200, origin); }

  const token = typeof body.token === "string" ? body.token : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : NaN;
  if (!token || token.length < 16) return json({ ok: false, error: "invalid_token" }, 200, origin);
  if (!mimeType) return json({ ok: false, error: "missing_mime" }, 200, origin);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return json({ ok: false, error: "invalid_size" }, 200, origin);
  if (sizeBytes > MAX_BYTES) return json({ ok: false, error: "file_too_large" }, 200, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "server_error" }, 500, origin);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // אימות הטוקן בצד שרת (אותו hash כמו hash_customer_token).
  const hash = await sha256Hex(token);
  const { data: tok, error: tokErr } = await admin
    .from("customer_tokens")
    .select("id,return_case_id,action_type,document_type,status,expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (tokErr) return json({ ok: false, error: "server_error" }, 500, origin);
  if (!tok) return json({ ok: false, error: "invalid_token" }, 200, origin);
  if (tok.status === "used") return json({ ok: false, error: "used_token" }, 200, origin);
  if (tok.status === "revoked") return json({ ok: false, error: "revoked_token" }, 200, origin);
  if (tok.status !== "active") return json({ ok: false, error: "token_not_usable" }, 200, origin);
  if (new Date(tok.expires_at).getTime() <= Date.now()) return json({ ok: false, error: "expired_token" }, 200, origin);
  if (tok.action_type !== "sign_policy" && tok.action_type !== "upload_doc")
    return json({ ok: false, error: "action_not_allowed" }, 200, origin);

  // חובה: תיק תקף לפני בניית נתיב (מונע 'null/customer/...').
  if (!tok.return_case_id) return json({ ok: false, error: "missing_case" }, 200, origin);

  // סוג מסמך — חייב מפתח מפורש נתמך (אין fallback ל-'other' לסוג לא-מוכר).
  const docType = tok.action_type === "sign_policy" ? (tok.document_type ?? "signed_policy") : tok.document_type;
  if (!docType) return json({ ok: false, error: "document_type_not_set" }, 200, origin);
  const allowed = MIME_BY_DOCTYPE[docType];
  if (!allowed) return json({ ok: false, error: "document_type_not_allowed" }, 200, origin);
  if (!allowed.includes(mimeType)) return json({ ok: false, error: "mime_not_allowed" }, 200, origin);

  // נתיב דטרמיניסטי יחיד — נגזר מהטוקן בלבד.
  const path = `${tok.return_case_id}/customer/${tok.id}/${docType}`;
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed) return json({ ok: false, error: "sign_url_failed" }, 500, origin);

  // לא צורכים את טוקן הלקוח כאן — הצריכה ב-submit_customer_action לאחר אימות האובייקט.
  return json({ ok: true, bucket: BUCKET, path: signed.path, uploadToken: signed.token }, 200, origin);
});
