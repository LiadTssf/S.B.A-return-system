// בדיקות 5C חיות: נתיבי השירות שה-UI משתמש בהם (validate→submit חיצוני, מצבי טוקן,
// סקירה דרך RPC, ורענון מצב ה-workflow דרך evaluateWorkflow — אותה פונקציה של ה-loader/סימולטור).
// הרצה: node scripts/smoke-5c.ts  (Node 23+ — type-stripping מובנה). לא מדפיס creds/טוקנים גולמיים.
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
const CASE = "SMOKE-5C-CASE";
const CUST = "SMOKE-5C CO";
let pass = 0, fail = 0;
const ok = (m: string) => { console.log("  ✓", m); pass++; };
const bad = (m: string, e?: unknown) => { console.log("  ✗", m, e ? "— " + JSON.stringify(e) : ""); fail++; };

async function cleanup() {
  const { data: docs } = await authed.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d: any) => d.object_path).filter(Boolean);
  if (paths.length) await authed.storage.from("case-documents").remove(paths);
  await authed.from("return_cases").delete().eq("id", CASE);
  await authed.from("customers").delete().eq("name", CUST);
}

// משחזר את איסוף העובדות של ה-loader, ומריץ את אותו evaluateWorkflow (ה-UI/סימולטור = אותו מקור).
async function liveState() {
  const [c, segs, docs, toks, subs] = await Promise.all([
    authed.from("return_cases").select("status").eq("id", CASE).single(),
    authed.from("truck_coordination").select("planned_date,customer_confirmed").eq("return_case_id", CASE),
    authed.from("case_documents").select("document_type").eq("return_case_id", CASE),
    authed.from("customer_tokens").select("action_type,status,expires_at,document_type").eq("return_case_id", CASE),
    authed.from("customer_submissions").select("action_type,status,submitted_at").eq("return_case_id", CASE),
  ]);
  return evaluateWorkflow({
    caseId: CASE,
    caseStatus: (c.data as any).status,
    tokens: (toks.data ?? []).map((t: any) => ({ action: t.action_type, status: t.status, expiresAtMs: Date.parse(t.expires_at), documentType: t.document_type })),
    submissions: (subs.data ?? []).map((s: any) => ({ action: s.action_type, status: s.status, submittedAtMs: Date.parse(s.submitted_at) })),
    documentTypes: Array.from(new Set((docs.data ?? []).map((d: any) => d.document_type))),
    confirmedSchedule: (segs.data ?? []).some((s: any) => !!s.planned_date && !!s.customer_confirmed),
    nowMs: Date.now(),
  });
}
const issue = (action: string, extra = {}) => authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: action, ...extra });

async function main() {
  const { error: si } = await authed.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה"); process.exit(1); }
  ok("עובד הבדיקה התחבר (coordinator)");
  await cleanup();
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({ id: CASE, customer_name: CUST, project_name: "בדיקת 5C", site: "—", equipment_type: "rental", status: "open", created_by: "smoke-5c" });

  console.log("[מצב התחלתי]");
  let s = await liveState();
  s.steps.sign.state === "not_started" && s.nextAction === "sign_policy"
    ? ok("workflow התחלתי: sign not_started, nextAction=sign_policy") : bad("מצב התחלתי שגוי", s);

  // סימולציית sign done (מסמך signed_policy אמיתי) → מתקדם ל-schedule
  await authed.from("case_documents").insert({ return_case_id: CASE, document_type: "signed_policy", file_name: "policy.png", storage_provider: "supabase", bucket_name: "case-documents", object_path: `${CASE}/signed_policy/fixture`, mime_type: "image/png", size_bytes: 1, uploaded_by: "smoke-5c" });
  s = await liveState();
  s.steps.sign.state === "done" && s.nextAction === "schedule" ? ok("לאחר signed_policy: sign done, nextAction=schedule") : bad("לא התקדם ל-schedule", s);

  console.log("[הגשה חיצונית — schedule]");
  const t1 = (await issue("schedule")).data as any;
  t1?.token ? ok("issue schedule") : bad("issue schedule");
  s = await liveState();
  s.steps.schedule.state === "awaiting_customer" ? ok("טוקן פעיל → schedule awaiting_customer") : bad("לא awaiting", s.steps.schedule);
  const v1 = (await anon.rpc("validate_customer_token", { p_token: t1.token })).data as any;
  v1?.valid === true && v1?.action_type === "schedule" ? ok("anon validate → תקף (schedule)") : bad("validate נכשל", v1);
  const sub1 = (await anon.rpc("submit_customer_action", { p_token: t1.token, p_payload: { type: "schedule", requestedDate: "2026-07-12", segments: [{ requestedDate: "2026-07-12" }] } })).data as any;
  sub1?.status === "pending_review" ? ok("anon submit schedule → pending_review") : bad("submit נכשל", sub1);
  s = await liveState();
  s.steps.schedule.state === "pending_review" && s.blockedOnReview && s.nextAction === null
    ? ok("רענון מצב: schedule pending_review, חסום, אין nextAction") : bad("מצב אחרי הגשה שגוי", s);

  const v1b = (await anon.rpc("validate_customer_token", { p_token: t1.token })).data as any;
  v1b?.reason === "consumed" ? ok("טוקן לאחר הגשה → consumed") : bad("לא consumed", v1b);

  console.log("[סקירת עובד + רענון מצב]");
  const r1 = await authed.rpc("review_customer_submission", { p_submission_id: sub1.submission_id, p_status: "approved" });
  (r1.data as any)?.status === "approved" ? ok("review approved (RPC)") : bad("approve נכשל", r1.error);
  s = await liveState();
  s.steps.schedule.state === "done" && s.nextAction === "upload_doc"
    ? ok("רענון מצב אחרי אישור: schedule done, nextAction=upload_doc") : bad("מצב אחרי אישור שגוי", s);

  console.log("[מצבי טוקן revoked + דחייה]");
  const c1 = (await issue("cancel_request")).data as any;
  await authed.rpc("revoke_customer_token", { p_token_id: c1.token_id });
  const vc1 = (await anon.rpc("validate_customer_token", { p_token: c1.token })).data as any;
  vc1?.reason === "revoked" ? ok("טוקן מבוטל → revoked") : bad("לא revoked", vc1);

  const c2 = (await issue("cancel_request")).data as any;
  const subc2 = (await anon.rpc("submit_customer_action", { p_token: c2.token, p_payload: { type: "cancel_request", reason: "בדיקת דחייה" } })).data as any;
  const rr = await authed.rpc("review_customer_submission", { p_submission_id: subc2.submission_id, p_status: "rejected", p_review_note: "לא רלוונטי" });
  (rr.data as any)?.status === "rejected" ? ok("review rejected (RPC)") : bad("reject נכשל", rr.error);
  s = await liveState();
  s.cancel === "rejected" ? ok("רענון מצב: ענף cancel = rejected (אופציונלי)") : bad("cancel לא rejected", { cancel: s.cancel });
  s.nextAction !== "cancel_request" ? ok("cancel לעולם אינו nextAction") : bad("cancel הפך ל-nextAction!");

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט ל-audit עסקי — immutable)");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
