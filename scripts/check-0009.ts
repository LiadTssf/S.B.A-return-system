// בדיקה ממוקדת: האם 0009 הוחל? ההבדל הנצפה היחיד — submit_customer_action ל-upload_doc
// מחזיר pending_review (0009 הוחל) או auto_applied (לא הוחל). מנפיק טוקן, מעלה לנתיב הנגזר
// (signed URL ע"י קואורדינטור — מדמה את ה-Edge Function), מגיש, ומדפיס את הסטטוס. מנקה.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const l of txt.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const CASE = "CHECK-0009-CASE", CUST = "CHECK-0009 CO", BUCKET = "case-documents";

async function main() {
  const { error } = await authed.auth.signInWithPassword({ email: (env.SMOKE_TEST_EMAIL ?? "").trim(), password: env.SMOKE_TEST_PASSWORD ?? "" });
  if (error) { console.error("AUTH FAILED"); process.exit(1); }
  await authed.from("return_cases").delete().eq("id", CASE);
  await authed.from("customers").delete().eq("name", CUST);
  await authed.from("customers").insert({ name: CUST });
  await authed.from("return_cases").insert({ id: CASE, customer_name: CUST, project_name: "0009 check", site: "—", equipment_type: "rental", status: "open", created_by: "check-0009" });

  const t = (await authed.rpc("issue_customer_token", { p_case_id: CASE, p_action_type: "upload_doc", p_document_type: "delivery_note" })).data as any;
  const path = `${CASE}/customer/${t.token_id}/delivery_note`;
  const signed = await authed.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  await anon.storage.from(BUCKET).uploadToSignedUrl(path, signed.data!.token, new Blob(["%PDF-1.4"], { type: "application/pdf" }), { contentType: "application/pdf" });
  const res = (await anon.rpc("submit_customer_action", { p_token: t.token, p_payload: { title: "check" }, p_object_path: path })).data as any;

  const status = res?.status ?? "(none)";
  const applied = status === "pending_review";
  console.log(`upload_doc submit status = ${status}`);
  console.log(`0009 APPLIED = ${applied ? "YES" : "NO"}${status === "auto_applied" ? " (still pre-0009)" : ""}`);

  // ניקוי (cascade מוחק טוקנים/הגשות/מסמכים; מסירים אובייקט Storage)
  await authed.storage.from(BUCKET).remove([path]);
  await authed.from("return_cases").delete().eq("id", CASE);
  await authed.from("customers").delete().eq("name", CUST);
  await authed.auth.signOut();
  process.exit(applied ? 0 : 2);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
