// בדיקות 0008 מול ה-DB החי: סקירת הגשות דרך RPC + שלילת UPDATE ישיר + אי-שינוי עמודות מוגנות.
// מתחבר כעובד בדיקה (coordinator). לא מדפיס creds/טוקנים גולמיים.
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
if (!url || !anonKey || !email || !password) { console.error("חסר תצורה ב-.env.local"); process.exit(1); }

const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const CASE = "SMOKE-0008-CASE";
const CUST = "SMOKE-0008 CO";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };
const permDenied = (e) => !!e && (e.code === "42501" || /permission denied/i.test(e.message ?? ""));

async function cleanup() {
  await authed.from("return_cases").delete().eq("id", CASE); // cascade: tokens/submissions
  await authed.from("customers").delete().eq("name", CUST);
}
async function createPending(action, payload) {
  const iss = await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: action });
  const raw = iss.data?.token;
  if (!raw) throw new Error("issue failed for " + action);
  const sub = await anon.rpc("submit_customer_action", { p_token: raw, p_payload: payload });
  if (!sub.data?.submission_id) throw new Error("submit failed for " + action + ": " + (sub.error?.message ?? ""));
  return sub.data.submission_id;
}

async function main() {
  const { error: si } = await authed.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה"); process.exit(1); }
  const { data: u } = await authed.auth.getUser();
  const uid = u?.user?.id;
  ok("עובד הבדיקה התחבר (coordinator)");

  await cleanup();
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({
    id: CASE, customer_name: CUST, project_name: "בדיקת 0008", site: "—",
    equipment_type: "rental", status: "open", created_by: "smoke-0008",
  });

  const subA = await createPending("schedule", { requestedDate: "2026-07-05", note: "A" });

  // ---------- 1) UPDATE ישיר נשלל ----------
  console.log("[שלילת UPDATE ישיר]");
  {
    const d = await authed.from("customer_submissions").update({ review_note: "hack" }).eq("id", subA).select();
    d.error ? ok(`UPDATE ישיר נשלל${permDenied(d.error) ? " (permission denied)" : ""}`) : bad("UPDATE ישיר עבר!");
  }

  // ---------- 6) רק 4 שדות משתנים (snapshot לפני/אחרי) ----------
  console.log("[אי-שינוי עמודות מוגנות + מעבר approved]");
  const before = (await authed.from("customer_submissions").select("*").eq("id", subA).single()).data;
  // ---------- 2) pending_review → approved ----------
  {
    const d = await authed.rpc("review_customer_submission", { p_submission_id: subA, p_status: "approved", p_review_note: "אישור בדיקה" });
    d.data?.ok === true && d.data?.status === "approved" ? ok("review: pending_review → approved") : bad("approve נכשל", d.error ?? d.data);
  }
  const after = (await authed.from("customer_submissions").select("*").eq("id", subA).single()).data;
  {
    const protectedCols = ["customer_token_id", "return_case_id", "action_type", "payload", "submitted_at", "created_at"];
    const changed = protectedCols.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
    changed.length === 0 ? ok("עמודות מוגנות ללא שינוי (token/case/action/payload/submitted_at/created_at)") : bad("עמודות מוגנות השתנו: " + changed.join(","));
    (after?.status === "approved" && after?.reviewed_at && after?.reviewed_by === uid && after?.review_note === "אישור בדיקה")
      ? ok("רק status/reviewed_at/reviewed_by(=auth.uid())/review_note עודכנו") : bad("שדות סקירה שגויים", JSON.stringify({ rb: after?.reviewed_by === uid }));
  }

  // ---------- 7) בדיוק שורת audit עסקית אחת ----------
  console.log("[audit]")
  {
    const d = await authed.from("audit_logs").select("action_type,metadata_json")
      .eq("return_case_id", CASE).in("action_type", ["customer_submission_approved", "customer_submission_rejected"]);
    const n = (d.data ?? []).filter((r) => r.metadata_json?.submission_id === subA).length;
    n === 1 ? ok("בדיוק שורת audit עסקית אחת לאישור") : bad(`מספר שורות audit ל-subA = ${n} (צפוי 1)`, d.error);
  }

  // ---------- 5) סקירה שנייה נדחית ----------
  console.log("[מעברים לא-חוקיים]");
  {
    const d = await authed.rpc("review_customer_submission", { p_submission_id: subA, p_status: "rejected" });
    d.error ? ok("סקירה שנייה (לא pending) נדחתה") : bad("סקירה שנייה עברה!");
  }

  // ---------- 3) pending_review → rejected ----------
  const subB = await createPending("cancel_request", { reason: "בדיקת דחייה" });
  {
    const d = await authed.rpc("review_customer_submission", { p_submission_id: subB, p_status: "rejected", p_review_note: "נדחה בבדיקה" });
    d.data?.status === "rejected" ? ok("review: pending_review → rejected") : bad("reject נכשל", d.error ?? d.data);
  }

  // ---------- 4) סטטוס יעד לא-חוקי נדחה ----------
  const subC = await createPending("schedule", { requestedDate: "2026-07-06" });
  {
    const d = await authed.rpc("review_customer_submission", { p_submission_id: subC, p_status: "in_progress" });
    d.error ? ok("סטטוס יעד לא-חוקי נדחה") : bad("סטטוס לא-חוקי עבר!");
    const still = (await authed.from("customer_submissions").select("status").eq("id", subC).single()).data;
    still?.status === "pending_review" ? ok("subC נשאר pending אחרי מעבר לא-חוקי") : bad("subC השתנה בטעות", still?.status);
  }

  // ---------- 8) anon אינו יכול לקרוא ל-RPC ----------
  console.log("[anon]");
  {
    const d = await anon.rpc("review_customer_submission", { p_submission_id: subC, p_status: "approved" });
    permDenied(d.error) ? ok("anon review_customer_submission נדחה (permission denied)") : bad("anon הצליח/שגוי!", d.error);
  }

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט ל-audit עסקי — immutable)");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
