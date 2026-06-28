// בדיקות 0010 (resolution + site/איש-קשר ברמת התיק) — להרצה *אחרי* החלת 0010.
// node scripts/smoke-0010.ts · coordinator · לא מדפיס creds/טוקנים.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const l of txt.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const authed = createClient(url, anonKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (m: string) => { console.log("  ✓", m); pass++; };
const bad = (m: string, e?: unknown) => { console.log("  ✗", m, e !== undefined ? "— " + JSON.stringify(e) : ""); fail++; };
const permDenied = (e: any) => !!e && (e.code === "42501" || /permission denied/i.test(e.message ?? ""));

const P = "ITK10";
const companies = new Set<string>();
const projNames = new Set<string>();
const createdCases: string[] = [];

async function submitIntake(company: string): Promise<string> {
  companies.add(company);
  const t = (await authed.rpc("issue_customer_token", { p_case_id: null, p_action_type: "intake_request", p_document_type: null })).data as any;
  const { data, error } = await anon.rpc("submit_customer_action", {
    p_token: t.token, p_payload: { type: "intake_request", company, project: "פרויקט מקורי", site: "אתר מקורי", equipmentType: "rental", customerName: "איש מקורי", phone: "050-0000000" },
  });
  if (error || !data?.submission_id) throw new Error("submit intake: " + (error?.message ?? ""));
  return data.submission_id as string;
}
const approve = (subId: string, res: Record<string, unknown>) => authed.rpc("approve_intake_request", { p_submission_id: subId, p_resolution: res });
const caseRow = async (id: string) => (await authed.from("return_cases").select("customer_id,project_id,site,contact_name,contact_phone").eq("id", id).single()).data as any;
const subRow = async (id: string) => (await authed.from("customer_submissions").select("status,payload,resolution,created_case_id").eq("id", id).single()).data as any;
const custRow = async (name: string) => (await authed.from("customers").select("id,phone").eq("name", name).maybeSingle()).data as any;
async function newCustomer(name: string, phone?: string) { companies.add(name); return (await authed.from("customers").insert({ name, phone: phone ?? null }).select("id").single()).data as any; }
async function newProject(custId: string, name: string, site: string) { projNames.add(name); return (await authed.from("projects").insert({ customer_id: custId, name, site }).select("id").single()).data as any; }
const track = (r: any) => { if (r?.case_id) createdCases.push(r.case_id); return r; };
async function cleanup() {
  for (const id of createdCases) await authed.from("return_cases").delete().eq("id", id);
  if (projNames.size) await authed.from("projects").delete().in("name", [...projNames]);
  if (companies.size) await authed.from("customers").delete().in("name", [...companies]);
}

async function main() {
  const { error } = await authed.auth.signInWithPassword({ email: (env.SMOKE_TEST_EMAIL ?? "").trim(), password: env.SMOKE_TEST_PASSWORD ?? "" });
  if (error) { console.error("AUTH FAILED"); process.exit(1); }
  ok("עובד הבדיקה התחבר (coordinator)");
  await cleanup();

  // [1] create customer+project; site/contact ברמת התיק; payload נשמר; resolution+audit
  console.log("[1] valid create + case-level site/contact]");
  {
    projNames.add("פרויקט סופי"); companies.add(`${P} A-FIN`);
    const sub = await submitIntake(`${P} A-ORIG`);
    const r = track((await approve(sub, { create_customer: { name: `${P} A-FIN`, phone: "0521111111" }, create_project: { name: "פרויקט סופי" }, site: "אתר A", contact_name: "רכז A", contact_phone: "0539999999", equipment_type: "rental", note: "ok" })).data as any);
    r?.ok ? ok("אושר (create customer+project)") : bad("approve", r);
    const c = await caseRow(r.case_id);
    (c?.site === "אתר A" && c?.contact_name === "רכז A" && c?.contact_phone === "0539999999") ? ok("site+contact_name+contact_phone נשמרו על התיק") : bad("case fields", c);
    const s = await subRow(sub);
    (s?.payload?.company === `${P} A-ORIG` && s?.payload?.site === "אתר מקורי") ? ok("payload מקורי נשמר") : bad("payload", s?.payload);
    (s?.resolution?.site === "אתר A" && s?.resolution?.contact_phone === "0539999999") ? ok("resolution סופי נשמר") : bad("resolution", s?.resolution);
    const pj = (await authed.from("projects").select("site").eq("id", r.project_id).single()).data as any;
    (pj?.site === null) ? ok("projects.site של פרויקט intake חדש = NULL (לא סמכותי)") : bad("project site not null", pj?.site);
    const aud = await authed.from("audit_logs").select("metadata_json").eq("return_case_id", r.case_id).eq("action_type", "customer_intake_approved");
    (aud.data?.length === 1) ? ok("audit יחיד") : bad("audit", aud.data?.length);
    const r2 = (await approve(sub, { create_customer: { name: "x" }, create_project: { name: "y" }, site: "אתר", equipment_type: "rental" })).data as any;
    (r2?.already && r2?.case_id === r.case_id) ? ok("אישור כפול → אותו תיק") : bad("double", r2);
  }

  // [2] אותו לקוח+פרויקט + אתרים שונים → תיקים נפרדים; אנשי-קשר שונים; ללא כפל פרויקט
  console.log("[2] same customer+project, different sites → separate cases]");
  {
    const cust = await newCustomer(`${P} MULTI`);
    const proj = await newProject(cust.id, "פרויקט איתן", "אתר ברירת-מחדל");
    const s1 = await submitIntake(`${P} MULTI-1`);
    const r1 = track((await approve(s1, { existing_customer_id: cust.id, existing_project_id: proj.id, site: "אביגדור אשת 11", contact_name: "איש 1", contact_phone: "0500000001", equipment_type: "rental" })).data as any);
    const s2 = await submitIntake(`${P} MULTI-2`);
    const r2 = track((await approve(s2, { existing_customer_id: cust.id, existing_project_id: proj.id, site: "אביגדור אשת 20", contact_name: "איש 2", contact_phone: "0500000002", equipment_type: "rental" })).data as any);
    const c1 = await caseRow(r1.case_id), c2 = await caseRow(r2.case_id);
    (r1.case_id !== r2.case_id) ? ok("שני תיקים נפרדים") : bad("not separate cases");
    (c1?.customer_id === cust.id && c2?.customer_id === cust.id && c1?.project_id === proj.id && c2?.project_id === proj.id) ? ok("אותו לקוח + אותו פרויקט") : bad("customer/project mismatch", { c1, c2 });
    (c1?.site === "אביגדור אשת 11" && c2?.site === "אביגדור אשת 20") ? ok("אתרים שונים (site עצמאי לתיק)") : bad("sites", { s1: c1?.site, s2: c2?.site });
    (c1?.contact_name === "איש 1" && c2?.contact_name === "איש 2" && c1?.contact_phone === "0500000001" && c2?.contact_phone === "0500000002") ? ok("אנשי-קשר/טלפונים שונים לכל תיק") : bad("contacts", { c1, c2 });
    const { count } = await authed.from("projects").select("id", { count: "exact", head: true }).eq("customer_id", cust.id).eq("name", "פרויקט איתן");
    count === 1 ? ok("אתר שונה לא יצר פרויקט כפול") : bad("dup project", count);
  }

  // [2b] מרוץ מקבילי ליצירת פרויקט (אותו customer,name) → פרויקט יחיד, ללא מיזוג
  console.log("[2b] concurrent create-project race]");
  {
    const cust = await newCustomer(`${P} PRACE`);
    const sa = await submitIntake(`${P} PRACE-1`);
    const sb = await submitIntake(`${P} PRACE-2`);
    projNames.add("פרויקט מרוץ");
    const call = (sid: string) => approve(sid, { existing_customer_id: cust.id, create_project: { name: "פרויקט מרוץ" }, site: "אתר", equipment_type: "rental" });
    const [ra, rb] = await Promise.all([call(sa), call(sb)]);
    for (const x of [ra, rb]) if ((x.data as any)?.case_id) createdCases.push((x.data as any).case_id);
    const okN = [ra, rb].filter((x) => (x.data as any)?.ok).length;
    const errN = [ra, rb].filter((x) => x.error).length;
    const { count } = await authed.from("projects").select("id", { count: "exact", head: true }).eq("customer_id", cust.id).eq("name", "פרויקט מרוץ");
    count === 1 ? ok("מקבילי create_project → פרויקט (customer,name) יחיד") : bad("dup project", count);
    (okN === 1 && errN === 1) ? ok("מקבילי: אחד הצליח, השני נדחה (ללא מיזוג שקט)") : bad("race outcome", { okN, errN });
  }

  // [3] בעלות פרויקט נאכפת
  console.log("[3] project ownership]");
  {
    const a = await newCustomer(`${P} OWN-A`); const pa = await newProject(a.id, "פרויקט A", "אתר");
    const b = await newCustomer(`${P} OWN-B`);
    const sub = await submitIntake(`${P} OWN-ORIG`);
    (await approve(sub, { existing_customer_id: b.id, existing_project_id: pa.id, site: "אתר", equipment_type: "rental" })).error ? ok("פרויקט שאינו של הלקוח נדחה") : bad("foreign project accepted!");
  }

  // [4] create-customer name conflict
  console.log("[4] create-customer conflict]");
  {
    await newCustomer(`${P} DUP`);
    const sub = await submitIntake(`${P} DUP-ORIG`);
    (await approve(sub, { create_customer: { name: `${P} DUP` }, create_project: { name: "פ" }, site: "אתר", equipment_type: "rental" })).error ? ok("create_customer בשם קיים נדחה") : bad("dup merged!");
  }

  // [5] טלפון לקוח גלובלי לא נדרס; טלפון התיק נפרד
  console.log("[5] customer global phone preserved]");
  {
    const cust = await newCustomer(`${P} GPHONE`, "0500000000");
    const sub = await submitIntake(`${P} GPHONE-ORIG`);
    const r = track((await approve(sub, { existing_customer_id: cust.id, create_project: { name: "פ-g" }, site: "אתר", contact_phone: "0511111111", equipment_type: "rental" })).data as any);
    projNames.add("פ-g");
    ((await custRow(`${P} GPHONE`))?.phone === "0500000000") ? ok("טלפון לקוח גלובלי לא נדרס") : bad("global phone overwritten");
    ((await caseRow(r.case_id))?.contact_phone === "0511111111") ? ok("טלפון איש-קשר נשמר על התיק") : bad("case phone");
  }

  // [6] create_project בשם קיים ללקוח → דחייה
  console.log("[6] create-project name conflict]");
  {
    const cust = await newCustomer(`${P} PCONF`); await newProject(cust.id, "פרויקט קיים", "אתר");
    const sub = await submitIntake(`${P} PCONF-ORIG`);
    (await approve(sub, { existing_customer_id: cust.id, create_project: { name: "פרויקט קיים" }, site: "אתר אחר", equipment_type: "rental" })).error ? ok("create_project בשם קיים ללקוח נדחה") : bad("dup project name created!");
  }

  // [7] exactly-one ; [8] שדות לא-חוקיים (site חסר)
  console.log("[7/8] exactly-one + invalid]");
  {
    const cust = await newCustomer(`${P} XOR`);
    const sub = await submitIntake(`${P} XOR-ORIG`);
    (await approve(sub, { existing_customer_id: cust.id, create_customer: { name: "x" }, create_project: { name: "p" }, site: "אתר", equipment_type: "rental" })).error ? ok("שתי אופציות לקוח → נדחה") : bad("both!");
    (await approve(sub, { create_project: { name: "p" }, site: "אתר", equipment_type: "rental" })).error ? ok("ללא אופציית לקוח → נדחה") : bad("none!");
    (await approve(sub, { create_customer: { name: `${P} XOR2` }, create_project: { name: "p" }, equipment_type: "rental" })).error ? ok("site חסר → נדחה") : bad("missing site!");
    companies.add(`${P} XOR2`);
  }

  // [9] anon ; [10] concurrent ; [11] rejected ; [12] direct update ; [13] malformed id
  console.log("[9-13]");
  {
    const d = await anon.rpc("approve_intake_request", { p_submission_id: "00000000-0000-0000-0000-000000000000", p_resolution: {} });
    permDenied(d.error) ? ok("anon approve נדחה") : bad("anon", d.error);

    const subC = await submitIntake(`${P} CONC-ORIG`);
    const resC = { create_customer: { name: `${P} CONC` }, create_project: { name: "פ-conc" }, site: "אתר", equipment_type: "rental" };
    companies.add(`${P} CONC`); projNames.add("פ-conc");
    const [a, b] = await Promise.all([approve(subC, resC), approve(subC, resC)]);
    const id1 = (a.data as any)?.case_id, id2 = (b.data as any)?.case_id; if (id1) createdCases.push(id1);
    (id1 && id1 === id2) ? ok("אישור מקבילי → תיק אחד") : bad("concurrent", { id1, id2 });

    const subR = await submitIntake(`${P} REJ-ORIG`);
    await authed.rpc("review_customer_submission", { p_submission_id: subR, p_status: "rejected", p_review_note: "x" });
    (await approve(subR, { create_customer: { name: `${P} REJ` }, create_project: { name: "p" }, site: "אתר", equipment_type: "rental" })).error ? ok("הגשה שנדחתה אינה ניתנת לאישור (אין תיק)") : bad("rejected approved!");

    const du = await authed.from("customer_submissions").update({ status: "approved", created_case_id: "HACK" }).eq("id", "00000000-0000-0000-0000-000000000000").select();
    du.error ? ok("UPDATE ישיר נדחה") : bad("direct update!");

    const yr = new Date().getFullYear(); const bogus = `SBA-${yr}-LEGACY`;
    await authed.from("return_cases").insert({ id: bogus, customer_name: `${P} LEG`, project_name: "p", site: "אתר", equipment_type: "rental", status: "open", created_by: "smoke" });
    createdCases.push(bogus); companies.add(`${P} LEG`); projNames.add("פ-leg");
    const rl = track((await approve(await submitIntake(`${P} LEG-ORIG`), { create_customer: { name: `${P} LEG` }, create_project: { name: "פ-leg" }, site: "אתר", equipment_type: "rental" })).data as any);
    (rl?.ok && /^SBA-\d{4}-\d{4}$/.test(rl.case_id ?? "")) ? ok("מזהה היסטורי פגום לא שבר יצירה") : bad("malformed id", rl);
  }

  console.log("[ניקוי]");
  await cleanup();
  ok("נוקה (פרט להגשות חסרות-תיק שנדחו/נכשלו ול-audit)");
  console.log("  • דחויים חיים: factory_manager · עובד לא-פעיל · rollback-באמצע — מבני/מדיניות.");

  await authed.auth.signOut();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
