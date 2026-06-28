// בדיקת ה-Edge Function ה*פרוס* request-customer-upload (לא הלוגיקה המקומית).
// fetch ישיר עם שליטה ב-Origin. לא מדפיס creds/טוקנים/uploadToken/מפתחות — רק קודי-שגיאה ופס/כשל.
// הערה: רק טוקן upload_doc פעיל אחד לכל תיק (ייחוד) — לכן revoke/consume בין הנפקות.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const l of txt.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const FN = `${url}/functions/v1/request-customer-upload`;
const LOCALHOST = "http://localhost:5173";
const EVIL = "https://evil.example";
const BUCKET = "case-documents";
const CASE = "SMOKE-EDGE-CASE", CUST = "SMOKE-EDGE CO";

const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (m: string) => { console.log("  ✓", m); pass++; };
const bad = (m: string, e?: unknown) => { console.log("  ✗", m, e !== undefined ? "— " + JSON.stringify(e) : ""); fail++; };

async function callEdge(origin: string, body: unknown) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-json */ }
  return { status: r.status, acao: r.headers.get("access-control-allow-origin"), error: j?.error as string | undefined, ok: j?.ok === true, hasUploadToken: typeof j?.uploadToken === "string" && j.uploadToken.length > 0, uploadToken: j?.uploadToken as string | undefined, bucket: j?.bucket, path: j?.path as string | undefined };
}
async function issueTok(action: string, doc?: string): Promise<{ token: string; token_id: string }> {
  const { data, error } = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: action, p_document_type: doc ?? null });
  if (error || !data?.token) throw new Error(`issue ${action} failed: ${error?.message ?? "no token"}`);
  return data as any;
}
const validate = (raw: string) => anon.rpc("validate_customer_token", { p_token: raw });
const revoke = (id: string) => authed.rpc("revoke_customer_token", { p_token_id: id });
async function cleanup() {
  const { data: docs } = await authed.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d: any) => d.object_path).filter(Boolean);
  if (paths.length) await authed.storage.from(BUCKET).remove(paths);
  await authed.from("return_cases").delete().eq("id", CASE);
  await authed.from("customers").delete().eq("name", CUST);
}

async function main() {
  const { error } = await authed.auth.signInWithPassword({ email: (env.SMOKE_TEST_EMAIL ?? "").trim(), password: env.SMOKE_TEST_PASSWORD ?? "" });
  if (error) { console.error("AUTH FAILED"); process.exit(1); }
  ok("עובד הבדיקה התחבר");
  await cleanup();
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({ id: CASE, customer_name: CUST, project_name: "edge", site: "—", equipment_type: "rental", status: "open", created_by: "smoke-edge" });

  // ===== A) origin מורשה + טוקן תקף → uploadToken =====
  console.log("[A] allowed origin + valid token");
  const tA = await issueTok("upload_doc", "delivery_note");
  const a = await callEdge(LOCALHOST, { token: tA.token, mimeType: "application/pdf", sizeBytes: 4096 });
  (a.ok && a.hasUploadToken && a.bucket === BUCKET && a.acao === LOCALHOST)
    ? ok("הפונקציה הפרוסה החזירה ok+uploadToken (origin=localhost מורשה)") : bad("valid call", { status: a.status, error: a.error, acao: a.acao });
  const vA = (await validate(tA.token)).data as any;
  vA?.valid === true ? ok("הטוקן הגולמי לא נצרך בעת הנפקת ה-URL") : bad("token consumed by URL issuance", vA);

  // ה-uploadToken של הפונקציה הפרוסה עובד רק לנתיב הנגזר (שימוש פנימי — לא מודפס).
  if (a.path && a.uploadToken) {
    const good = await anon.storage.from(BUCKET).uploadToSignedUrl(a.path, a.uploadToken, new Blob(["%PDF"], { type: "application/pdf" }), { contentType: "application/pdf" });
    !good.error ? ok("signed upload עובד לנתיב הנגזר (uploadToken מהפונקציה הפרוסה)") : bad("derived path upload", good.error);
    const wrong = await anon.storage.from(BUCKET).uploadToSignedUrl(`${a.path}-wrong`, a.uploadToken, new Blob(["x"], { type: "application/pdf" }), { contentType: "application/pdf" });
    wrong.error ? ok("signed upload לנתיב שגוי נדחה (uploadToken צמוד-נתיב)") : bad("wrong-path upload allowed!");
  } else bad("no path/uploadToken from deployed function");

  // ===== B) origin אסור → 403 =====
  console.log("[B] forbidden origin");
  const b = await callEdge(EVIL, { token: tA.token, mimeType: "application/pdf", sizeBytes: 4096 });
  (b.status === 403 && b.acao !== EVIL) ? ok("origin אסור נדחה (403, ACAO לא מהדהד את evil)") : bad("forbidden origin", { status: b.status, acao: b.acao });
  await revoke(tA.token_id); // משחרר את הייחוד לפעולת upload_doc

  // ===== C) טוקן לא תקף =====
  console.log("[C] invalid token");
  const c = await callEdge(LOCALHOST, { token: "x".repeat(40), mimeType: "application/pdf", sizeBytes: 1000 });
  c.error === "invalid_token" ? ok("invalid_token נדחה") : bad("invalid token", { error: c.error });

  // ===== D) ולידציות MIME/גודל (לא צורך את הטוקן) =====
  console.log("[D] mime/size validation");
  const tC = await issueTok("upload_doc", "delivery_note");
  const mime = await callEdge(LOCALHOST, { token: tC.token, mimeType: "text/plain", sizeBytes: 1000 });
  mime.error === "mime_not_allowed" ? ok("MIME לא נתמך נדחה") : bad("mime", { error: mime.error });
  const big = await callEdge(LOCALHOST, { token: tC.token, mimeType: "application/pdf", sizeBytes: 16 * 1024 * 1024 });
  big.error === "file_too_large" ? ok("sizeBytes חורג נדחה") : bad("oversize", { error: big.error });
  const zero = await callEdge(LOCALHOST, { token: tC.token, mimeType: "application/pdf", sizeBytes: 0 });
  zero.error === "invalid_size" ? ok("sizeBytes=0 נדחה") : bad("size 0", { error: zero.error });
  const frac = await callEdge(LOCALHOST, { token: tC.token, mimeType: "application/pdf", sizeBytes: 1.5 });
  frac.error === "invalid_size" ? ok("sizeBytes לא-שלם נדחה") : bad("size frac", { error: frac.error });
  const vC = (await validate(tC.token)).data as any;
  vC?.valid === true ? ok("הטוקן נשאר תקף אחרי דחיות ולידציה (לא נצרך)") : bad("tokenC consumed", vC);

  // ===== F) טוקן שנוצל → used_token =====
  console.log("[F] used token (after real upload+submit)");
  const f0 = await callEdge(LOCALHOST, { token: tC.token, mimeType: "application/pdf", sizeBytes: 8 });
  if (f0.path) {
    const signed = await authed.storage.from(BUCKET).createSignedUploadUrl(f0.path, { upsert: true });
    if (signed.data) {
      await anon.storage.from(BUCKET).uploadToSignedUrl(f0.path, signed.data.token, new Blob(["%PDF"], { type: "application/pdf" }), { contentType: "application/pdf" });
      await anon.rpc("submit_customer_action", { p_token: tC.token, p_payload: { title: "edge" }, p_object_path: f0.path });
    }
  }
  const used = await callEdge(LOCALHOST, { token: tC.token, mimeType: "application/pdf", sizeBytes: 8 });
  used.error === "used_token" ? ok("used_token נדחה (לאחר submit)") : bad("used", { error: used.error });

  // ===== E) טוקן מבוטל → revoked_token =====
  console.log("[E] revoked token");
  const tB = await issueTok("upload_doc", "delivery_note");
  await revoke(tB.token_id);
  const e = await callEdge(LOCALHOST, { token: tB.token, mimeType: "application/pdf", sizeBytes: 1000 });
  e.error === "revoked_token" ? ok("revoked_token נדחה") : bad("revoked", { error: e.error });

  // ===== G) anon Storage ישיר עדיין נדחה =====
  console.log("[G] anon direct Storage denied");
  const g = await anon.storage.from(BUCKET).upload(`hack/${Date.now()}.txt`, new Blob(["x"], { type: "text/plain" }));
  g.error ? ok("anon upload ישיר ל-Storage נדחה") : bad("anon direct upload allowed!");

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה");
  console.log("  • הערה: expired_token לא נבדק חי (אי-אפשר לפוג טוקן מהלקוח); מכוסה ב-verify-0007.sql ובלוגיקת הפונקציה.");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
