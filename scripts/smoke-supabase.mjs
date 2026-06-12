// בדיקת עשן מול Supabase החי — מאמת חיבור, סכימה, RLS ו-Storage.
// מכניס שורות בדיקה, קורא אותן, ומנקה אחריו. לא משאיר זבל ב-DB.
// הרצה: node scripts/smoke-supabase.mjs  (מתוך תיקיית main project)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnv();
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const key = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
if (!url || !key) {
  console.error("חסר VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY ב-.env.local");
  process.exit(1);
}
console.log("URL:", url);
const sb = createClient(url, key);

const CASE_ID = "SMOKE-TEST-CASE";
let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, "—", e?.message ?? e); fail++; };

async function main() {
  // ניקוי מקדים (אם נשאר מריצה קודמת)
  await sb.from("audit_logs").delete().eq("return_case_id", CASE_ID);
  await sb.from("return_cases").delete().eq("id", CASE_ID);
  await sb.from("customers").delete().eq("name", "SMOKE TEST CO");

  console.log("\n[1] customers");
  const { data: cust, error: e1 } = await sb
    .from("customers").insert({ name: "SMOKE TEST CO" }).select().single();
  e1 ? bad("insert customer", e1) : ok("insert customer " + cust.id);

  console.log("[2] return_cases");
  const { error: e2 } = await sb.from("return_cases").insert({
    id: CASE_ID, customer_id: cust?.id ?? null, customer_name: "SMOKE TEST CO",
    project_name: "בדיקה", site: "—", equipment_type: "rental", status: "open",
    created_by: "smoke",
  });
  e2 ? bad("insert return_case", e2) : ok("insert return_case " + CASE_ID);

  console.log("[3] truck_coordination");
  const { data: seg, error: e3 } = await sb.from("truck_coordination").insert({
    return_case_id: CASE_ID, planned_date: "2026-06-15", truck_id: "T-SMOKE",
    customer_confirmed: true, status: "planned",
  }).select().single();
  e3 ? bad("insert truck_coordination", e3) : ok("insert segment " + seg.id);

  console.log("[4] action_items");
  const { error: e4 } = await sb.from("action_items").insert({
    return_case_id: CASE_ID, type: "case_waiting_review", title: "בדיקת עשן",
    priority: "normal", status: "open", dedupe_key: "smoke:" + CASE_ID,
  });
  e4 ? bad("insert action_item", e4) : ok("insert action_item");

  console.log("[5] audit_logs");
  const { error: e5 } = await sb.from("audit_logs").insert({
    return_case_id: CASE_ID, action_type: "create_case", actor_role: "coordinator",
    actor_id: "מתאמת החזרות", description: "בדיקת עשן",
  });
  e5 ? bad("insert audit_log", e5) : ok("insert audit_log");

  console.log("[6] read-back");
  const { data: cases, error: e6 } = await sb.from("return_cases").select("*").eq("id", CASE_ID);
  e6 ? bad("select return_case", e6) : ok("read return_case: " + (cases?.length ?? 0) + " row(s)");
  const { count, error: e6b } = await sb
    .from("truck_coordination").select("id", { count: "exact", head: true }).eq("planned_date", "2026-06-15");
  e6b ? bad("count by date", e6b) : ok("count truck on date: " + count);

  console.log("[7] storage bucket case-documents");
  const blob = new Blob(["smoke test " + Date.now()], { type: "text/plain" });
  const path = "smoke-test/test.txt";
  const up = await sb.storage.from("case-documents").upload(path, blob, { upsert: true });
  if (up.error) bad("upload to case-documents", up.error);
  else {
    ok("upload object: " + up.data.path);
    const signed = await sb.storage.from("case-documents").createSignedUrl(path, 60);
    signed.error ? bad("signed url", signed.error) : ok("signed url created");
    await sb.storage.from("case-documents").remove([path]);
    ok("removed test object");
  }

  console.log("[8] cleanup");
  await sb.from("audit_logs").delete().eq("return_case_id", CASE_ID);
  const { error: e8 } = await sb.from("return_cases").delete().eq("id", CASE_ID); // cascade -> segments+items
  await sb.from("customers").delete().eq("id", cust?.id);
  e8 ? bad("cleanup", e8) : ok("cleaned up test rows");

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
