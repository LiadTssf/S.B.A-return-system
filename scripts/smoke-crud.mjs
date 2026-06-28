// בדיקת רגרסיית CRUD לקואורדינטור על הטבלאות התפעוליות (בסיס לפני/אחרי 0008).
// 0008 משנה הרשאות רק כך: revoke update על customer_submissions, ו-revoke
// truncate/references/trigger (לא-CRUD). לכן CRUD על 6 הטבלאות התפעוליות זהה אחרי 0008.
// מתחבר כעובד בדיקה (coordinator) מ-.env.local. לא מדפיס creds.
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

const sb = createClient(url, anonKey, { auth: { persistSession: false } });
const CASE = "CRUD-CHECK-CASE";
const CUST = "CRUD-CHECK CO";
const CUST2 = "CRUD-CHECK CO (renamed)";
const PROJ = "CRUD-CHECK PROJ";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };
const check = (label, error) => (error ? bad(label, error) : ok(label));

async function cleanup() {
  const { data: docs } = await sb.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d) => d.object_path).filter(Boolean);
  if (paths.length) await sb.storage.from("case-documents").remove(paths);
  await sb.from("return_cases").delete().eq("id", CASE);          // cascade: coord/docs/items/subs/tokens
  await sb.from("projects").delete().eq("name", PROJ);
  await sb.from("customers").delete().in("name", [CUST, CUST2]);
}

async function main() {
  const { error: si } = await sb.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה"); process.exit(1); }
  ok("עובד הבדיקה התחבר (coordinator)");
  await cleanup();

  // ---------- customers: I/U/D + resolve-duplicate (upsert) ----------
  console.log("[customers]");
  let e, data;
  ({ data, error: e } = await sb.from("customers").insert({ name: CUST }).select("id").single());
  check("INSERT customer", e);
  const custId = data?.id;
  ({ error: e } = await sb.from("customers").select("id").eq("name", CUST).limit(1)); check("SELECT customers", e);
  ({ error: e } = await sb.from("customers").update({ name: CUST2 }).eq("id", custId)); check("UPDATE customer name", e);
  await sb.from("customers").update({ name: CUST }).eq("id", custId); // החזרה לשם המקורי
  // resolve duplicate = upsert on conflict(name) — זה מה ש-casesAdapter עושה
  ({ error: e } = await sb.from("customers").upsert({ name: CUST }, { onConflict: "name" }).select("id").single());
  check("UPSERT customer (resolve duplicate)", e);

  // ---------- projects: I/U/D ----------
  console.log("[projects]");
  let projId;
  ({ data, error: e } = await sb.from("projects").insert({ customer_id: custId, name: PROJ, site: "—" }).select("id").single());
  check("INSERT project", e); projId = data?.id;
  ({ error: e } = await sb.from("projects").select("id").eq("id", projId)); check("SELECT projects", e);
  ({ error: e } = await sb.from("projects").update({ site: "אתר מעודכן" }).eq("id", projId)); check("UPDATE project details", e);
  ({ error: e } = await sb.from("projects").delete().eq("id", projId)); check("DELETE project", e);

  // ---------- return_cases: I/U/D ----------
  console.log("[return_cases]");
  ({ error: e } = await sb.from("return_cases").insert({
    id: CASE, customer_id: custId, customer_name: CUST, project_name: PROJ, site: "—",
    equipment_type: "rental", status: "open", created_by: "crud-check",
  })); check("INSERT return_case", e);
  ({ error: e } = await sb.from("return_cases").select("id").eq("id", CASE)); check("SELECT return_cases", e);
  ({ error: e } = await sb.from("return_cases").update({ site: "אתר מעודכן", status: "coordinating" }).eq("id", CASE));
  check("UPDATE return-case details/status", e);

  // ---------- truck_coordination: I/U/D (שינוי/ביטול תאריך+סטטוס) ----------
  console.log("[truck_coordination]");
  let segId;
  ({ data, error: e } = await sb.from("truck_coordination")
    .insert({ return_case_id: CASE, planned_date: "2026-07-01", status: "planned" }).select("id").single());
  check("INSERT truck_coordination", e); segId = data?.id;
  ({ error: e } = await sb.from("truck_coordination").select("id").eq("id", segId)); check("SELECT truck_coordination", e);
  ({ error: e } = await sb.from("truck_coordination").update({ planned_date: "2026-07-09", status: "cancelled" }).eq("id", segId));
  check("UPDATE truck date/status (change/cancel)", e);
  ({ error: e } = await sb.from("truck_coordination").delete().eq("id", segId)); check("DELETE truck_coordination segment", e);

  // ---------- case_documents: I/U/D + Storage ----------
  console.log("[case_documents]");
  const path = `${CASE}/other/crud-${Date.now()}.txt`;
  const up = await sb.storage.from("case-documents").upload(path, new Blob(["crud"], { type: "text/plain" }), { contentType: "text/plain" });
  up.error ? bad("Storage upload (manage docs)", up.error) : ok("Storage upload (manage docs)");
  let docId;
  ({ data, error: e } = await sb.from("case_documents").insert({
    return_case_id: CASE, document_type: "other", file_name: "crud.txt",
    storage_provider: "supabase", bucket_name: "case-documents", object_path: path,
    mime_type: "text/plain", size_bytes: 4, uploaded_by: "crud-check",
  }).select("id").single()); check("INSERT case_document metadata", e); docId = data?.id;
  ({ error: e } = await sb.from("case_documents").select("id").eq("id", docId)); check("SELECT case_documents", e);
  ({ error: e } = await sb.from("case_documents").update({ title: "כותרת מעודכנת" }).eq("id", docId)); check("UPDATE case_document", e);
  if (docId) { await sb.storage.from("case-documents").remove([path]); }
  ({ error: e } = await sb.from("case_documents").delete().eq("id", docId)); check("DELETE case_document", e);

  // ---------- action_items: I/U/D ----------
  console.log("[action_items]");
  let aiId;
  ({ data, error: e } = await sb.from("action_items").insert({
    return_case_id: CASE, type: "case_waiting_review", title: "crud check",
    priority: "normal", status: "open", dedupe_key: `crud:${CASE}:${Date.now()}`,
  }).select("id").single()); check("INSERT action_item", e); aiId = data?.id;
  ({ error: e } = await sb.from("action_items").select("id").eq("id", aiId)); check("SELECT action_items", e);
  ({ error: e } = await sb.from("action_items").update({ status: "handled", handled_by: "crud-check" }).eq("id", aiId));
  check("UPDATE action_item", e);
  ({ error: e } = await sb.from("action_items").delete().eq("id", aiId)); check("DELETE action_item", e);

  // ---------- customer_submissions: SELECT נשמר (UPDATE יוסר ב-0008 — מכוון) ----------
  console.log("[customer_submissions]");
  ({ error: e } = await sb.from("customer_submissions").select("id").eq("return_case_id", CASE));
  check("SELECT customer_submissions", e);
  console.log("  • הערה: UPDATE ישיר על customer_submissions יוסר ב-0008 (מכוון — סקירה דרך RPC).");

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה");

  await sb.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((err) => { console.error("FATAL:", err?.message ?? err); process.exit(1); });
