// בדיקת משתמש לא-פעיל (PART 4.5). מריצים כאשר פרופיל עובד הבדיקה מוגדר is_active=false.
// מאמת: התחברות מצליחה (Auth נפרד מ-profile), אך גישת נתונים/כתיבה נדחית.
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
if (!url || !anonKey || !email || !password) {
  console.error("חסר VITE_SUPABASE_* או SMOKE_TEST_* ב-.env.local");
  process.exit(1);
}

const sb = createClient(url, anonKey, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };
const bad = (m, e) => { console.log("  ✗", m, e ? "— " + (e.message ?? e) : ""); fail++; };

async function main() {
  const { error: si } = await sb.auth.signInWithPassword({ email, password });
  // התחברות אמורה להצליח — Auth אינו תלוי ב-profile.is_active
  si ? bad("התחברות נכשלה (לא צפוי)", si) : ok("התחברות הצליחה (Auth נפרד מ-profile)");

  const { data: isEmp } = await sb.rpc("is_active_employee");
  isEmp === false
    ? ok("is_active_employee() = false (הפרופיל לא-פעיל)")
    : bad(`is_active_employee צפוי false, התקבל ${JSON.stringify(isEmp)}`);

  // INSERT — נדחה קשיח (with check נכשל)
  const ins = await sb.from("customers").insert({ name: "INACTIVE-HACK" });
  if (ins.error) ok("INSERT customers נדחה (משתמש לא-פעיל)");
  else { bad("INSERT הצליח למשתמש לא-פעיל!"); }

  // SELECT — RLS מסנן ל-0 שורות (אין גישה לנתונים)
  const sel = await sb.from("return_cases").select("id").limit(5);
  (!sel.error && (sel.data ?? []).length === 0)
    ? ok("SELECT return_cases → 0 שורות (אין גישה לנתונים)")
    : bad(`צפוי 0 שורות, התקבל ${sel.error ? "error" : (sel.data ?? []).length}`);

  // Storage upload — נדחה
  const up = await sb.storage.from("case-documents").upload(`inactive/${Date.now()}.txt`, new Blob(["x"]));
  up.error ? ok("Storage upload נדחה (משתמש לא-פעיל)") : bad("Storage upload הצליח למשתמש לא-פעיל!");

  await sb.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
