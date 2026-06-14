// בדיקות Auth/RLS מול Supabase החי (PART 4.5 שלב 2).
// מתחבר כעובד בדיקה (coordinator), בודק חיוב/שלילה/Storage/audit-immutability/RLS.
// קורא creds מ-.env.local בלבד — לעולם לא מדפיס אותם.
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
if (!email || !password) { console.error("חסר SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD ב-.env.local"); process.exit(1); }

const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const CASE = "AUTH-SMOKE-CASE";
const CUST = "AUTH-SMOKE CO";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };

async function cleanup() {
  const { data: docs } = await authed.from("case_documents").select("object_path").eq("return_case_id", CASE);
  const paths = (docs ?? []).map((d) => d.object_path).filter(Boolean);
  if (paths.length) await authed.storage.from("case-documents").remove(paths);
  await authed.from("return_cases").delete().eq("id", CASE); // cascade: docs/coord/items
  await authed.from("customers").delete().eq("name", CUST);
}

async function main() {
  console.log("[התחברות]");
  const { error: si } = await authed.auth.signInWithPassword({ email, password });
  if (si) { console.error("  ✗ התחברות נכשלה —", si.message); process.exit(1); }
  ok("עובד הבדיקה התחבר");

  console.log("[עזרי RLS]");
  const { data: isEmp } = await authed.rpc("is_active_employee");
  isEmp === true ? ok("is_active_employee() = true") : bad("is_active_employee", isEmp);
  const { data: role } = await authed.rpc("current_app_role");
  role === "coordinator" ? ok("current_app_role() = coordinator") : bad("current_app_role", role);

  await cleanup();

  console.log("[חיוב — coordinator מאומת: CRUD]");
  let e;
  ({ error: e } = await authed.from("customers").insert({ name: CUST }));
  e ? bad("insert customer", e) : ok("insert customer");
  ({ error: e } = await authed.from("return_cases").insert({
    id: CASE, customer_name: CUST, project_name: "בדיקת Auth", site: "—",
    equipment_type: "rental", status: "open", created_by: "auth-smoke",
  }));
  e ? bad("insert return_case", e) : ok("insert return_case");
  const { data: rows, error: se } = await authed.from("return_cases").select("*").eq("id", CASE);
  se ? bad("select return_case", se) : ok(`select return_case (${rows.length})`);
  ({ error: e } = await authed.from("return_cases").update({ status: "coordinating" }).eq("id", CASE));
  e ? bad("update return_case", e) : ok("update return_case status");
  const { data: seg, error: ce } = await authed.from("truck_coordination")
    .insert({ return_case_id: CASE, planned_date: "2026-07-01", status: "planned", customer_confirmed: true })
    .select().single();
  ce ? bad("insert truck_coordination", ce) : ok("insert truck_coordination");
  ({ error: e } = await authed.from("action_items").insert({
    return_case_id: CASE, type: "case_waiting_review", title: "auth smoke",
    priority: "normal", status: "open", dedupe_key: "authsmoke:" + CASE,
  }));
  e ? bad("insert action_item", e) : ok("insert action_item");
  ({ error: e } = await authed.from("audit_logs").insert({
    return_case_id: CASE, action_type: "create_case", actor_role: "coordinator",
    actor_id: "auth-smoke", description: "AUTH-SMOKE",
  }));
  e ? bad("insert audit_log", e) : ok("insert audit_log (נשאר — immutable)");

  console.log("[Storage — חיוב]");
  const path = `${CASE}/delivery_note/${Date.now()}-t.txt`;
  const up = await authed.storage.from("case-documents").upload(path, new Blob(["auth smoke"], { type: "text/plain" }), { contentType: "text/plain" });
  if (up.error) bad("upload (authed)", up.error);
  else {
    ok("upload ל-Storage (authed)");
    await authed.from("case_documents").insert({
      return_case_id: CASE, document_type: "delivery_note", file_name: "t.txt",
      storage_provider: "supabase", bucket_name: "case-documents", object_path: path,
      mime_type: "text/plain", size_bytes: 10, uploaded_by: "auth-smoke",
    });
    const signed = await authed.storage.from("case-documents").createSignedUrl(path, 60);
    if (signed.error) bad("signed url", signed.error);
    else { const r = await fetch(signed.data.signedUrl); r.ok ? ok(`signed URL + הורדה (HTTP ${r.status})`) : bad("הורדה", `HTTP ${r.status}`); }
  }

  console.log("[שלילה — anon ללא התחברות]");
  const n1 = await anon.from("return_cases").select("id").limit(1);
  n1.error ? ok("anon SELECT return_cases נדחה") : bad("anon קרא return_cases!");
  const n2 = await anon.from("customers").insert({ name: "ANON-HACK" });
  if (n2.error) ok("anon INSERT customers נדחה");
  else { bad("anon כתב customers!"); await authed.from("customers").delete().eq("name", "ANON-HACK"); }
  const n3 = await anon.from("audit_logs").select("id").limit(1);
  n3.error ? ok("anon SELECT audit_logs נדחה") : bad("anon קרא audit!");
  const an = await anon.storage.from("case-documents").upload(`hack/${Date.now()}.txt`, new Blob(["x"]));
  an.error ? ok("anon Storage upload נדחה") : bad("anon העלה ל-Storage!");

  console.log("[audit immutable — authed]");
  const fake = "00000000-0000-0000-0000-000000000000";
  const u = await authed.from("audit_logs").update({ description: "tamper" }).eq("id", fake);
  u.error ? ok("audit UPDATE נדחה (immutable)") : bad("audit ניתן לעדכון!");
  const d = await authed.from("audit_logs").delete().eq("id", fake);
  d.error ? ok("audit DELETE נדחה (immutable)") : bad("audit ניתן למחיקה!");

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט לרשומות audit — immutable, מסומנות AUTH-SMOKE)");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
