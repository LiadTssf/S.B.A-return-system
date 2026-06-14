// בדיקת עשן למסמכים (PART 2) + לוגיקת חסימת סגירת משאית (PART 3) מול Supabase החי.
// מעלה קובץ אמיתי ל-Storage, שומר metadata, מאמת signed URL, בודק את שאילתות
// "תעודה קיימת" / "תמונת משאית קיימת", ומנקה אחריו.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const l of txt.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const sb = createClient(url, (env.VITE_SUPABASE_ANON_KEY ?? "").trim());

const CASE_ID = "DOCS-SMOKE-CASE";
const BUCKET = "case-documents";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };

async function hasReturnDoc(caseId) {
  const { count } = await sb.from("case_documents").select("id", { count: "exact", head: true })
    .eq("return_case_id", caseId).in("document_type", ["return_certificate", "delivery_note"]);
  return (count ?? 0) > 0;
}
async function hasTruckPhoto(caseId) {
  const { count } = await sb.from("case_documents").select("id", { count: "exact", head: true })
    .eq("return_case_id", caseId).eq("document_type", "truck_photo");
  return (count ?? 0) > 0;
}

async function cleanup() {
  const { data } = await sb.from("case_documents").select("object_path").eq("return_case_id", CASE_ID);
  const paths = (data ?? []).map((r) => r.object_path).filter(Boolean);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  await sb.from("case_documents").delete().eq("return_case_id", CASE_ID);
  await sb.from("return_cases").delete().eq("id", CASE_ID);
}

async function uploadDoc(docType, fileName, body, title) {
  const objectPath = `${CASE_ID}/${docType}/${Date.now()}-${fileName}`;
  const up = await sb.storage.from(BUCKET).upload(objectPath, new Blob([body], { type: "text/plain" }), { contentType: "text/plain" });
  if (up.error) throw up.error;
  const { error } = await sb.from("case_documents").insert({
    return_case_id: CASE_ID, document_type: docType, file_name: fileName,
    title: title ?? null,
    storage_provider: "supabase", bucket_name: BUCKET, object_path: objectPath,
    mime_type: "text/plain", size_bytes: body.length, uploaded_by: "smoke",
  });
  if (error) { await sb.storage.from(BUCKET).remove([objectPath]); throw error; }
  return objectPath;
}

async function main() {
  await cleanup();
  await sb.from("return_cases").insert({
    id: CASE_ID, customer_name: "בדיקת מסמכים", project_name: "בדיקה",
    site: "—", equipment_type: "rental", status: "awaiting_return", created_by: "smoke",
  });

  console.log("[1] העלאת תעודת משלוח (delivery_note) עם כותרת");
  let p1;
  try { p1 = await uploadDoc("delivery_note", "delivery.txt", "DELIVERY NOTE", "תעודת משלוח 4523"); ok("הועלה + metadata נשמר: " + p1); }
  catch (e) { bad("upload delivery_note", e); }

  console.log("[2] קריאת metadata + אימות כותרת");
  const { data: docs, error: de } = await sb.from("case_documents").select("*").eq("return_case_id", CASE_ID);
  if (de) bad("select", de);
  else {
    ok(`נמצאו ${docs.length} מסמכים בטבלה`);
    const dn = docs.find((d) => d.document_type === "delivery_note");
    dn && dn.title === "תעודת משלוח 4523"
      ? ok(`כותרת נשמרה ונשלפה: "${dn.title}" (file_name: ${dn.file_name})`)
      : bad(`כותרת לא נשמרה כצפוי — title=${JSON.stringify(dn?.title)}`);
  }

  console.log("[3] signed URL + הורדה");
  if (p1) {
    const signed = await sb.storage.from(BUCKET).createSignedUrl(p1, 60);
    if (signed.error) bad("signed url", signed.error);
    else {
      ok("signed URL נוצר");
      try { const r = await fetch(signed.data.signedUrl); r.ok ? ok(`הורדה עבדה (HTTP ${r.status})`) : bad(`הורדה HTTP ${r.status}`); }
      catch (e) { bad("fetch signed url", e); }
    }
  }

  console.log("[4] לוגיקת חסימת סגירה (PART 3)");
  const cert1 = await hasReturnDoc(CASE_ID);
  const photo1 = await hasTruckPhoto(CASE_ID);
  cert1 && !photo1
    ? ok("יש תעודה, אין תמונת משאית → סגירה חסומה (צפוי)")
    : bad(`מצב לא צפוי: cert=${cert1} photo=${photo1}`);

  console.log("[5] העלאת תמונת משאית (truck_photo) ללא כותרת → fallback");
  try { await uploadDoc("truck_photo", "truck.txt", "TRUCK PHOTO"); ok("תמונת משאית הועלתה (ללא כותרת)"); }
  catch (e) { bad("upload truck_photo", e); }
  const { data: tp } = await sb.from("case_documents").select("title, file_name").eq("return_case_id", CASE_ID).eq("document_type", "truck_photo").maybeSingle();
  tp && (tp.title === null || tp.title === undefined)
    ? ok(`ללא כותרת → title=NULL, התצוגה תיפול ל-file_name (${tp.file_name})`)
    : bad(`ציפינו ל-title=NULL, התקבל ${JSON.stringify(tp?.title)}`);
  const cert2 = await hasReturnDoc(CASE_ID);
  const photo2 = await hasTruckPhoto(CASE_ID);
  cert2 && photo2 ? ok("יש תעודה + תמונה → סגירה מותרת (צפוי)") : bad(`מצב לא צפוי: cert=${cert2} photo=${photo2}`);

  console.log("[6] ניקוי");
  await cleanup();
  const { count } = await sb.from("case_documents").select("id", { count: "exact", head: true }).eq("return_case_id", CASE_ID);
  (count ?? 0) === 0 ? ok("נוקה (מסמכים + Storage + תיק)") : bad("נשארו רשומות");

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
