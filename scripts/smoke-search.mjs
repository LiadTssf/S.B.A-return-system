// בדיקת עשן לחיפוש מתקדם מול Supabase החי.
// מאמת: (1) תיק חדש נמצא בחיפוש טקסט; (2) תיקי seed ישנים אינם קיימים ב-DB.
// משכפל את לוגיקת החיפוש של supabaseSearchAdapter (select + סינון טקסט ב-JS).
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

const norm = (s) => String(s).trim().toLowerCase();
const ID = "SEARCH-SMOKE-1";
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m) => { console.log("  ✗", m); fail++; };

async function main() {
  await sb.from("return_cases").delete().eq("id", ID);
  await sb.from("customers").delete().eq("name", "בדיקת חיפוש קלוד");

  // תיק חדש עם המילה "בדיקה" בפרויקט
  const { error: ins } = await sb.from("return_cases").insert({
    id: ID, customer_name: "בדיקת חיפוש קלוד", project_name: "תיק בדיקה",
    site: "תל אביב", equipment_type: "rental", status: "open", created_by: "smoke",
  });
  if (ins) { console.error("insert failed:", ins.message); process.exit(1); }

  // משכפל את החיפוש: שליפת כל התיקים + סינון טקסט ב-JS
  const { data: rows, error } = await sb.from("return_cases").select("*");
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`סה"כ תיקים ב-DB: ${rows.length}`);

  const q = norm("בדיקה");
  const found = rows.filter(
    (r) => norm(r.id).includes(q) || norm(r.customer_name).includes(q) ||
           norm(r.project_name).includes(q) || norm(r.site).includes(q),
  );
  found.some((r) => r.id === ID)
    ? ok(`תיק חדש "תיק בדיקה" נמצא בחיפוש ("בדיקה" → ${found.length} תוצאות)`)
    : bad('תיק חדש לא נמצא בחיפוש');

  // תיקי seed ישנים — לא אמורים להיות ב-DB
  const seedNames = ["אלקטרה בנייה", "שיכון ובינוי", "דניה סיבוס", "רולידר"];
  const seedHits = rows.filter((r) => seedNames.includes(r.customer_name));
  seedHits.length === 0
    ? ok("אף תיק seed ישן (אלקטרה/שיכון/דניה/רולידר) לא קיים ב-DB")
    : bad(`נמצאו ${seedHits.length} תיקי seed ב-DB: ${seedHits.map((r) => r.id).join(", ")}`);

  // ניקוי
  await sb.from("return_cases").delete().eq("id", ID);
  await sb.from("customers").delete().eq("name", "בדיקת חיפוש קלוד");
  ok("נוקה");

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
