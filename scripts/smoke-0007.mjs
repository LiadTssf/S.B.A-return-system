// בדיקות 0007 מול ה-DB החי: סכימה + מחזור-חיים מלא של RPC + שלילות anon.
// מתחבר כעובד בדיקה (coordinator) מ-.env.local. לעולם לא מדפיס creds או טוקנים גולמיים.
// (בדיקת תפוגה-חוסמת-הנפקה מכוסה ב-scripts/verify-0007.sql ב-SQL editor — לא ניתן
//  להפוך טוקן לפג-תוקף מהלקוח כי כתיבה ישירה ל-customer_tokens נשללה.)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const l of txt.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const email = (env.SMOKE_TEST_EMAIL ?? "").trim();
const password = env.SMOKE_TEST_PASSWORD ?? "";
if (!url || !anonKey) { console.error("חסר VITE_SUPABASE_URL/ANON_KEY"); process.exit(1); }
if (!email || !password) { console.error("חסר SMOKE_TEST_EMAIL/PASSWORD"); process.exit(1); }

const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const CASE = "SMOKE-0007-CASE";
const CUST = "SMOKE-0007 CO";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };
const permDenied = (e) => !!e && (e.code === "42501" || /permission denied/i.test(e.message ?? ""));
const BOGUS = "x".repeat(32); // טוקן לא-קיים באורך חוקי

async function cleanup() {
  const { data: docs } = await authed.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d) => d.object_path).filter(Boolean);
  if (paths.length) await authed.storage.from("case-documents").remove(paths);
  await authed.from("return_cases").delete().eq("id", CASE); // cascade: tokens/submissions/docs/coord
  await authed.from("customers").delete().eq("name", CUST);
}

async function main() {
  const { error: si } = await authed.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה"); process.exit(1); }
  ok("עובד הבדיקה התחבר (coordinator)");

  // ---------- סכימה ----------
  console.log("[סכימה — קיום טבלאות/עמודות חדשות]");
  let r;
  r = await authed.from("customer_submissions")
    .select("id,customer_token_id,return_case_id,action_type,payload,status,submitted_at,reviewed_by,review_note").limit(0);
  r.error ? bad("customer_submissions", r.error) : ok("customer_submissions קיימת + עמודות");
  r = await authed.from("customer_tokens")
    .select("segment_id,document_type,issued_by,revoked_at,revoked_by,replaced_by").limit(0);
  r.error ? bad("customer_tokens עמודות חדשות", r.error) : ok("customer_tokens — 6 עמודות חדשות");
  r = await authed.from("case_documents").select("customer_token_id").limit(0);
  r.error ? bad("case_documents.customer_token_id", r.error) : ok("case_documents.customer_token_id");
  r = await authed.from("audit_logs").select("category").limit(0);
  r.error ? bad("audit_logs.category", r.error) : ok("audit_logs.category");

  await cleanup();
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({
    id: CASE, customer_name: CUST, project_name: "בדיקת 0007", site: "—",
    equipment_type: "rental", status: "open", created_by: "smoke-0007",
  });

  // ---------- מחזור חיים: schedule (ללא קובץ) ----------
  console.log("[מחזור חיים — schedule]");
  let raw1;
  ({ data: r } = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: "schedule" }));
  if (r?.token) { raw1 = r.token; ok("issue (schedule) — הונפק טוקן"); } else bad("issue (schedule)");
  {
    const d = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: "schedule" });
    d.error ? ok("הנפקה כפולה (טוקן פעיל קיים) נדחתה") : bad("הנפקה כפולה לא נדחתה!");
  }
  {
    const d = await anon.rpc("validate_customer_token", { p_token: raw1 });
    d.data?.valid === true && d.data?.action_type === "schedule"
      ? ok("anon validate — תקין (action=schedule)") : bad("anon validate schedule", d.error ?? d.data);
  }
  {
    const d = await anon.rpc("submit_customer_action", { p_token: raw1, p_payload: { requestedDate: "2026-07-05", note: "smoke" } });
    d.data?.ok === true && d.data?.status === "pending_review"
      ? ok("anon submit (schedule) → pending_review") : bad("anon submit schedule", d.error ?? d.data);
  }
  {
    const d = await anon.rpc("validate_customer_token", { p_token: raw1 });
    d.data?.valid === false && d.data?.reason === "consumed"
      ? ok("הטוקן נצרך (validate=consumed)") : bad("טוקן לא נצרך", d.data);
  }
  {
    const d = await anon.rpc("submit_customer_action", { p_token: raw1, p_payload: {} });
    d.error ? ok("הגשה חוזרת על טוקן שנוצל נדחתה") : bad("הגשה חוזרת לא נדחתה!");
  }

  // ---------- revoke ----------
  console.log("[revoke]");
  let raw2, id2;
  ({ data: r } = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: "cancel_request" }));
  raw2 = r?.token; id2 = r?.token_id;
  r?.token ? ok("issue (cancel_request)") : bad("issue cancel_request");
  {
    const d = await authed.rpc("revoke_customer_token", { p_token_id: id2 });
    d.data?.ok === true ? ok("revoke הצליח") : bad("revoke", d.error);
  }
  {
    const d = await anon.rpc("validate_customer_token", { p_token: raw2 });
    d.data?.reason === "revoked" ? ok("validate על מבוטל → revoked") : bad("revoked validate", d.data);
  }

  // ---------- replace ----------
  console.log("[replace]");
  let raw3, id3, raw4;
  ({ data: r } = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: "intake_request" }));
  raw3 = r?.token; id3 = r?.token_id;
  ({ data: r } = await authed.rpc("replace_customer_token", { p_token_id: id3 }));
  raw4 = r?.token;
  r?.token ? ok("replace — הונפק טוקן חדש") : bad("replace", r);
  {
    const d = await anon.rpc("validate_customer_token", { p_token: raw3 });
    d.data?.reason === "revoked" ? ok("הטוקן הישן בוטל (revoked)") : bad("ישן לא בוטל", d.data);
  }
  {
    const d = await anon.rpc("validate_customer_token", { p_token: raw4 });
    d.data?.valid === true ? ok("הטוקן החדש תקף") : bad("חדש לא תקף", d.data);
  }

  // ---------- זרימת קובץ: upload_doc (מדמה את ה-Edge Function ע"י העלאת עובד לנתיב הנגזר) ----------
  console.log("[זרימת קובץ — upload_doc]");
  let rawF, idF;
  ({ data: r } = await authed.rpc("issue_customer_token",
    { p_case_id: CASE, p_action_type: "upload_doc", p_document_type: "delivery_note" }));
  rawF = r?.token; idF = r?.token_id;
  r?.token ? ok("issue (upload_doc, delivery_note)") : bad("issue upload_doc");
  const path = `${CASE}/customer/${idF}/delivery_note`;
  {
    const up = await authed.storage.from("case-documents")
      .upload(path, new Blob(["%PDF-smoke"], { type: "application/pdf" }), { contentType: "application/pdf" });
    up.error ? bad("העלאת עובד לנתיב הנגזר", up.error) : ok("הועלה אובייקט לנתיב הנגזר (מדמה Edge Function)");
  }
  {
    const d = await anon.rpc("submit_customer_action", { p_token: rawF, p_payload: {}, p_object_path: `${CASE}/customer/${idF}/WRONG` });
    d.error ? ok("נתיב שגוי נדחה (object path mismatch)") : bad("נתיב שגוי לא נדחה!");
  }
  {
    const d = await anon.rpc("validate_customer_token", { p_token: rawF });
    d.data?.valid === true ? ok("טוקן הקובץ עדיין תקף אחרי כשל-נתיב (לא נצרך)") : bad("טוקן נצרך בטעות", d.data);
  }
  {
    const d = await anon.rpc("submit_customer_action",
      { p_token: rawF, p_payload: { fileName: "note.pdf", title: "תעודת משלוח" }, p_object_path: path });
    // פוסט-0009: upload_doc → pending_review (Level-2). יורץ לאחר החלת 0009.
    d.data?.ok === true && d.data?.status === "pending_review"
      ? ok("anon submit (upload_doc) → pending_review") : bad("submit upload_doc", d.error ?? d.data);
  }
  {
    const d = await authed.from("case_documents").select("id,document_type,object_path").eq("customer_token_id", idF);
    (d.data?.length === 1 && d.data[0].document_type === "delivery_note")
      ? ok("case_documents נרשם עם customer_token_id ונתיב נגזר") : bad("case_documents לא נרשם נכון", d.error ?? d.data);
  }

  // ---------- שלילות anon ----------
  console.log("[שלילות anon]");
  {
    const d = await anon.rpc("validate_customer_token", { p_token: BOGUS });
    (!d.error && d.data?.valid === false) ? ok("anon רשאי validate (בוצע)") : bad("anon validate חסום", d.error);
  }
  {
    const d = await anon.rpc("submit_customer_action", { p_token: BOGUS, p_payload: {} });
    (d.error && !permDenied(d.error)) ? ok("anon רשאי submit (בוצע, נדחה לוגית)") : bad("anon submit חסום/שגוי", d.error);
  }
  for (const fn of ["issue_customer_token", "revoke_customer_token", "replace_customer_token"]) {
    const args = fn === "issue_customer_token"
      ? { p_case_id: CASE, p_action_type: "schedule" }
      : { p_token_id: "00000000-0000-0000-0000-000000000000" };
    const d = await anon.rpc(fn, args);
    permDenied(d.error) ? ok(`anon ${fn} נדחה (permission denied)`) : bad(`anon ${fn} לא נדחה!`, d.error);
  }
  for (const t of ["customer_tokens", "customer_submissions", "case_documents"]) {
    const d = await anon.from(t).select("id").limit(1);
    d.error ? ok(`anon SELECT ${t} נדחה`) : bad(`anon קרא ${t}!`);
  }
  {
    const d = await anon.storage.from("case-documents").upload(`hack/${BOGUS}.txt`, new Blob(["x"]));
    d.error ? ok("anon Storage upload נדחה") : bad("anon העלה ל-Storage!");
  }

  // ---------- ניקוי ----------
  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט לרשומות audit עסקיות — immutable)");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
