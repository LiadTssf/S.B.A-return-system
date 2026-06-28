// בדיקות חבילת ההעלאה המאובטחת (חי). הרצה: node scripts/smoke-upload.ts
// ה-Edge Function אינו פרוס/רץ מקומית (אין CLI/Deno) → מדמים את מינוף ה-signed-upload-URL
// עם לקוח הקואורדינטור (לו יש הרשאת Storage insert לפי 0006). המנגנון זהה
// (createSignedUploadUrl → uploadToSignedUrl → submit_customer_action); הפונקציה הפרוסה
// תעשה זאת עם service role. הסמכות-האמת הסופית היא submit_customer_action.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { evaluateWorkflow } from "../src/lib/customer-workflow.ts";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const l of txt.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const email = (env.SMOKE_TEST_EMAIL ?? "").trim();
const password = env.SMOKE_TEST_PASSWORD ?? "";
if (!url || !anonKey || !email || !password) { console.error("חסר תצורה ב-.env.local"); process.exit(1); }

const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const BUCKET = "case-documents";
const CASE = "SMOKE-UP-CASE";
const CUST = "SMOKE-UP CO";
let pass = 0, fail = 0, skip = 0;
const ok = (m: string) => { console.log("  ✓", m); pass++; };
const bad = (m: string, e?: unknown) => { console.log("  ✗", m, e ? "— " + JSON.stringify(e) : ""); fail++; };
const note = (m: string) => { console.log("  •", m); skip++; };

async function cleanup() {
  const { data: docs } = await authed.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d: any) => d.object_path).filter(Boolean);
  if (paths.length) await authed.storage.from(BUCKET).remove(paths);
  await authed.from("return_cases").delete().eq("id", CASE);
  await authed.from("customers").delete().eq("name", CUST);
}
const issue = (action: string, docType?: string) =>
  authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: action, p_document_type: docType ?? null });
const validate = (raw: string) => anon.rpc("validate_customer_token", { p_token: raw });
const submit = (raw: string, payload: unknown, path?: string) =>
  anon.rpc("submit_customer_action", { p_token: raw, p_payload: payload, p_object_path: path ?? null });

// מדמה את ה-Edge Function: מנפיק signed-upload-URL לנתיב הנגזר (כקואורדינטור).
async function mint(caseId: string, tokenId: string, docType: string) {
  const path = `${caseId}/customer/${tokenId}/${docType}`;
  const { data, error } = await authed.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("mint failed: " + (error?.message ?? ""));
  return { path, token: data.token };
}
const blob = (bytes: string, type: string) => new Blob([bytes], { type });

async function liveUploadState() {
  const [c, segs, docs, toks, subs] = await Promise.all([
    authed.from("return_cases").select("status").eq("id", CASE).single(),
    authed.from("truck_coordination").select("planned_date,customer_confirmed").eq("return_case_id", CASE),
    authed.from("case_documents").select("document_type").eq("return_case_id", CASE),
    authed.from("customer_tokens").select("action_type,status,expires_at,document_type").eq("return_case_id", CASE),
    authed.from("customer_submissions").select("action_type,status,submitted_at").eq("return_case_id", CASE),
  ]);
  return evaluateWorkflow({
    caseId: CASE, caseStatus: (c.data as any).status,
    tokens: (toks.data ?? []).map((t: any) => ({ action: t.action_type, status: t.status, expiresAtMs: Date.parse(t.expires_at), documentType: t.document_type })),
    submissions: (subs.data ?? []).map((s: any) => ({ action: s.action_type, status: s.status, submittedAtMs: Date.parse(s.submitted_at) })),
    documentTypes: Array.from(new Set((docs.data ?? []).map((d: any) => d.document_type))),
    confirmedSchedule: (segs.data ?? []).some((s: any) => !!s.planned_date && !!s.customer_confirmed),
    nowMs: Date.now(),
  });
}

async function main() {
  const { error: si } = await authed.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה"); process.exit(1); }
  ok("עובד הבדיקה התחבר (coordinator)");
  await cleanup();
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({ id: CASE, customer_name: CUST, project_name: "בדיקת העלאה", site: "—", equipment_type: "rental", status: "open", created_by: "smoke-upload" });
  // קדם-תנאי לזרימה: signed_policy קיים (שלב sign) — נבנה אמיתית בבדיקה A.

  // ===== A) signed-policy: העלאה מבוקרת → auto_applied → sign מושלם =====
  console.log("[A] signed-policy upload");
  {
    const t = (await issue("sign_policy")).data as any;
    const { path, token } = await mint(CASE, t.token_id, "signed_policy");
    const up = await anon.storage.from(BUCKET).uploadToSignedUrl(path, token, blob("PNGDATA", "image/png"), { contentType: "image/png" });
    up.error ? bad("uploadToSignedUrl (signed_policy)", up.error) : ok("anon uploadToSignedUrl (signed_policy)");
    const res = (await submit(t.token, { signerName: "בודק" }, path)).data as any;
    res?.status === "auto_applied" ? ok("submit signed_policy → auto_applied") : bad("submit signed_policy", res);
    const d = await authed.from("case_documents").select("document_type").eq("customer_token_id", t.token_id);
    (d.data?.length === 1 && (d.data[0] as any).document_type === "signed_policy") ? ok("case_documents signed_policy נוצר") : bad("מסמך signed_policy", d.data);
    const s = await liveUploadState();
    s.steps.sign.state === "done" ? ok("workflow: sign מושלם לאחר חתימה") : bad("sign לא הושלם", s.steps.sign);
  }

  // ===== B) טוקן חתום תקף רק לנתיב שלו =====
  console.log("[B] signed URL bound to path");
  {
    const t = (await issue("upload_doc", "delivery_note")).data as any;
    const { token } = await mint(CASE, t.token_id, "delivery_note");
    const wrong = await anon.storage.from(BUCKET).uploadToSignedUrl(`${CASE}/customer/${t.token_id}/WRONG`, token, blob("x", "application/pdf"), { contentType: "application/pdf" });
    wrong.error ? ok("uploadToSignedUrl לנתיב שגוי נדחה (טוקן צמוד-נתיב)") : bad("נתיב שגוי עבר!");
    await authed.rpc("revoke_customer_token", { p_token_id: t.token_id }); // ניקוי הטוקן הזה
  }

  // ===== C) operational upload (upload_doc) → pending_review (Level-2) =====
  console.log("[C] operational document upload");
  let uploadStatus = "";
  {
    const t = (await issue("upload_doc", "delivery_note")).data as any;
    const { path, token } = await mint(CASE, t.token_id, "delivery_note");
    const up = await anon.storage.from(BUCKET).uploadToSignedUrl(path, token, blob("%PDF-1.4", "application/pdf"), { contentType: "application/pdf" });
    up.error ? bad("uploadToSignedUrl (delivery_note)", up.error) : ok("anon uploadToSignedUrl (delivery_note)");

    // נתיב שגוי ב-submit → נדחה, הטוקן לא נצרך
    const wrongSubmit = await submit(t.token, {}, `${CASE}/customer/${t.token_id}/WRONG`);
    wrongSubmit.error ? ok("submit נתיב שגוי נדחה (object path mismatch)") : bad("נתיב שגוי לא נדחה!");
    const vmid = (await validate(t.token)).data as any;
    vmid?.valid === true ? ok("הטוקן נשאר תקף אחרי כשל-נתיב (לא נצרך)") : bad("טוקן נצרך בטעות", vmid);

    const res = (await submit(t.token, { title: "תעודת משלוח" }, path)).data as any;
    uploadStatus = res?.status ?? "";
    res?.ok === true ? ok(`submit upload_doc → ${uploadStatus}`) : bad("submit upload_doc", res);
    const d = await authed.from("case_documents").select("document_type").eq("customer_token_id", t.token_id);
    (d.data?.length === 1 && (d.data[0] as any).document_type === "delivery_note") ? ok("case_documents delivery_note נוצר") : bad("מסמך delivery_note", d.data);

    const s = await liveUploadState();
    s.steps.upload.state === "pending_review" ? ok("workflow: upload pending_review (לא מושלם לפני אישור)") : bad("upload לא pending_review", s.steps.upload);

    // duplicate submission
    const dup = await submit(t.token, {}, path);
    dup.error ? ok("הגשה כפולה נדחתה (token used)") : bad("הגשה כפולה עברה!");

    // Level-2 approval (דורש 0009 — אחרת ההגשה auto_applied ולא ניתנת לאישור)
    const subId = res?.submission_id;
    if (uploadStatus === "pending_review") {
      const r = await authed.rpc("review_customer_submission", { p_submission_id: subId, p_status: "approved" });
      (r.data as any)?.status === "approved" ? ok("אישור עובד (review) הצליח") : bad("אישור נכשל", r.error);
      const s2 = await liveUploadState();
      s2.steps.upload.state === "done" ? ok("workflow: upload מושלם לאחר אישור עובד") : bad("upload לא הושלם אחרי אישור", s2.steps.upload);
    } else {
      note(`upload_doc חזר '${uploadStatus}' (0009 טרם הוחל) → דילוג על בדיקת אישור Level-2 חי (נבדק טהור ב-test-workflow).`);
    }
  }

  // ===== D) MIME לא נתמך נדחה ב-submit =====
  console.log("[D] MIME rejection");
  {
    const t = (await issue("sign_policy")).data as any;
    const { path, token } = await mint(CASE, t.token_id, "signed_policy");
    const up = await anon.storage.from(BUCKET).uploadToSignedUrl(path, token, blob("plain", "text/plain"), { contentType: "text/plain" });
    if (up.error) { ok("uploadToSignedUrl (text/plain) — נכשל/נחסם"); }
    else {
      const res = await submit(t.token, {}, path);
      res.error ? ok("submit דחה MIME לא נתמך (text/plain)") : bad("MIME לא נתמך עבר!");
      const v = (await validate(t.token)).data as any;
      v?.valid === true ? ok("הטוקן נשאר תקף אחרי דחיית MIME") : bad("טוקן נצרך בטעות (MIME)", v);
    }
    await authed.rpc("revoke_customer_token", { p_token_id: t.token_id });
  }

  // ===== E) retry דורס אותו נתיב דטרמיניסטי (upsert) =====
  console.log("[E] retry overwrite");
  {
    const t = (await issue("upload_doc", "return_certificate")).data as any;
    const { path, token } = await mint(CASE, t.token_id, "return_certificate");
    const u1 = await anon.storage.from(BUCKET).uploadToSignedUrl(path, token, blob("v1", "application/pdf"), { contentType: "application/pdf" });
    const { token: token2 } = await mint(CASE, t.token_id, "return_certificate"); // מינוף חוזר (כמו retry)
    const u2 = await anon.storage.from(BUCKET).uploadToSignedUrl(path, token2, blob("v2", "application/pdf"), { contentType: "application/pdf" });
    (!u1.error && !u2.error) ? ok("העלאה חוזרת דורסת אותו מפתח (אין הצטברות)") : bad("retry overwrite נכשל", u2.error ?? u1.error);
    await authed.rpc("revoke_customer_token", { p_token_id: t.token_id });
  }

  // ===== F) anon Storage ישיר עדיין נדחה =====
  console.log("[F] anon direct Storage denied");
  {
    const d = await anon.storage.from(BUCKET).upload(`hack/${Date.now()}.txt`, blob("x", "text/plain"));
    d.error ? ok("anon upload ישיר ל-Storage נדחה") : bad("anon העלה ישירות!");
  }

  // ===== G) טוקן מבוטל אינו מאפשר submit =====
  console.log("[G] revoked token");
  {
    const t = (await issue("upload_doc", "delivery_note")).data as any;
    await authed.rpc("revoke_customer_token", { p_token_id: t.token_id });
    const res = await submit(t.token, {}, `${CASE}/customer/${t.token_id}/delivery_note`);
    res.error ? ok("submit על טוקן מבוטל נדחה") : bad("submit על מבוטל עבר!");
  }

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט ל-audit עסקי — immutable)");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed, ${skip} noted ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
