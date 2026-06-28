-- ============================================================
-- PART (intake) — אישור בקשת לקוח חדש בשליטת רכז: יצירת return_case אטומית.
-- הרכז בוחר במפורש לקוח/פרויקט; site ואיש-קשר הם ברמת התיק (לא נגזרים מהפרויקט/לקוח).
-- אדיטיבי בלבד. אין לערוך 0001-0009. דורש: 0007 הורץ.
-- מיועד לסקירה והחלה ידנית.
-- ============================================================

-- ---------- שדות ברמת התיק: איש-קשר + טלפון (תיקון 2) ----------
-- site כבר קיים (return_cases.site, not null). contact_* חדשים — מידע תפעולי לתיק.
alter table public.return_cases
  add column if not exists contact_name  text,
  add column if not exists contact_phone text;

-- ---------- customer_submissions: קישור התיק + ה-resolution הסופי ----------
alter table public.customer_submissions
  add column if not exists created_case_id text references public.return_cases(id) on delete set null,
  add column if not exists resolution      jsonb; -- ערכי הרכז הסופיים (נפרד מ-payload המקורי)

create index if not exists idx_customer_submissions_created_case
  on public.customer_submissions(created_case_id);
create index if not exists idx_customer_submissions_pending_intake
  on public.customer_submissions(action_type, status)
  where action_type = 'intake_request' and return_case_id is null;
create unique index if not exists uq_submission_created_case
  on public.customer_submissions(created_case_id) where created_case_id is not null;

-- ---------- זהות פרויקט = (customer_id, name) ; site אינו חלק מהזהות ----------
-- אותו לקוח+פרויקט יכול לשרת מספר אתרים (כל אחד = תיק עם site משלו ב-return_cases).
-- Preflight: עצירה ברורה אם כבר קיימות כפילויות (customer_id,name) (אין מיזוג שקט).
do $$
declare n int;
begin
  select count(*) into n from (
    select customer_id, name from public.projects group by customer_id, name having count(*) > 1
  ) d;
  if n > 0 then
    raise exception '0010 preflight: % duplicate (customer_id,name) project group(s) — manual cleanup required before the unique index', n;
  end if;
end $$;
-- ייחוד ברמת DB → יצירת פרויקט בטוחה-למקביליות (שני מקבילים לא ייצרו כפיל).
create unique index if not exists uq_projects_customer_name on public.projects(customer_id, name);


-- ---------- RPC: אישור intake לפי resolution מפורש ----------
-- קלט:  p_submission_id · p_resolution jsonb:
--   { existing_customer_id? | create_customer:{name,phone?},
--     existing_project_id?  | create_project:{name},
--     site, contact_name?, contact_phone?, equipment_type, note? }
--   (בדיוק אופציה אחת ללקוח ואחת לפרויקט; site חובה ועצמאי; איש-קשר ברמת התיק.)
-- פלט:  { ok, case_id, customer_id, project_id, customer_created, project_created, already? }
create or replace function public.approve_intake_request(
  p_submission_id uuid,
  p_resolution    jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_sub      public.customer_submissions%rowtype;
  v_p        jsonb;
  v_has_ec   boolean; v_has_cc boolean; v_has_ep boolean; v_has_cp boolean;
  v_cc       jsonb;   v_cp jsonb;
  v_cust_id  uuid;    v_cust_name text; v_cust_created boolean := false; v_cust_phone text;
  v_proj_id  uuid;    v_proj_name text; v_proj_created boolean := false; v_proj_cust uuid;
  v_site     text;    v_equip text; v_contact text; v_contact_phone text; v_note text;
  v_year int; v_prefix text; v_max int; v_id text; i int;
  v_oc text; v_op text; v_os text;
begin
  -- 1. הרשאה: עובד פעיל תפעולי בלבד (factory_manager נדחה)
  if auth.uid() is null
     or not public.is_active_employee()
     or public.current_app_role() not in ('coordinator','logistics','admin') then
    raise exception 'not authorized to approve intake requests';
  end if;

  -- 2. נעילה
  select * into v_sub from public.customer_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission not found'; end if;

  -- idempotency
  if v_sub.status = 'approved' and v_sub.created_case_id is not null then
    return jsonb_build_object('ok', true, 'case_id', v_sub.created_case_id, 'already', true);
  end if;

  -- 3. תנאים מוקדמים
  if v_sub.action_type <> 'intake_request' then raise exception 'not an intake request'; end if;
  if v_sub.status <> 'pending_review' then raise exception 'submission is not pending review'; end if;
  if v_sub.return_case_id is not null then raise exception 'submission already linked to a case'; end if;

  v_p := v_sub.payload; -- המקורי — נשמר כפי שהוא
  v_oc := v_p->>'company'; v_op := v_p->>'project'; v_os := v_p->>'site';

  -- 4. בדיוק אופציה אחת ללקוח ואחת לפרויקט
  v_has_ec := (p_resolution ? 'existing_customer_id') and nullif(p_resolution->>'existing_customer_id','') is not null;
  v_cc := case when jsonb_typeof(p_resolution->'create_customer') = 'object' then p_resolution->'create_customer' end;
  v_has_cc := v_cc is not null;
  if v_has_ec = v_has_cc then raise exception 'exactly one customer option required'; end if;
  v_has_ep := (p_resolution ? 'existing_project_id') and nullif(p_resolution->>'existing_project_id','') is not null;
  v_cp := case when jsonb_typeof(p_resolution->'create_project') = 'object' then p_resolution->'create_project' end;
  v_has_cp := v_cp is not null;
  if v_has_ep = v_has_cp then raise exception 'exactly one project option required'; end if;

  -- 5. שדות סופיים ברמת התיק (site עצמאי וחובה; איש-קשר/טלפון ברמת התיק)
  v_site := btrim(coalesce(p_resolution->>'site',''));
  if length(v_site) < 2 or length(v_site) > 200 or v_site ~ '[[:cntrl:]]' then raise exception 'invalid site'; end if;
  v_equip := coalesce(p_resolution->>'equipment_type','');
  if v_equip not in ('rental','customer_owned','rental_and_customer') then raise exception 'invalid equipment type'; end if;
  v_contact := nullif(btrim(coalesce(p_resolution->>'contact_name','')), '');
  if v_contact is not null and (length(v_contact) > 150 or v_contact ~ '[[:cntrl:]]') then raise exception 'invalid contact name'; end if;
  v_contact_phone := nullif(btrim(coalesce(p_resolution->>'contact_phone','')), '');
  if v_contact_phone is not null and (length(v_contact_phone) > 30 or v_contact_phone !~ '^[0-9+() -]{1,30}$') then raise exception 'invalid contact phone'; end if;
  v_note := nullif(btrim(coalesce(p_resolution->>'note','')), '');
  if v_note is not null and (length(v_note) > 2000 or regexp_replace(v_note, '[\t\n\r]', '', 'g') ~ '[[:cntrl:]]') then raise exception 'invalid note'; end if;

  -- 6. לקוח — בחירה מפורשת. טלפון הלקוח הגלובלי נקבע רק ביצירה; לא נדרס לקוח קיים.
  if v_has_ec then
    select id, name into v_cust_id, v_cust_name from public.customers where id = (p_resolution->>'existing_customer_id')::uuid;
    if v_cust_id is null then raise exception 'selected customer not found'; end if;
  else
    v_cust_name := btrim(coalesce(v_cc->>'name',''));
    v_cust_phone := nullif(btrim(coalesce(v_cc->>'phone','')), '');
    if length(v_cust_name) < 2 or length(v_cust_name) > 150 or v_cust_name ~ '[[:cntrl:]]' then raise exception 'invalid customer name'; end if;
    if v_cust_phone is not null and (length(v_cust_phone) > 30 or v_cust_phone !~ '^[0-9+() -]{1,30}$') then raise exception 'invalid customer phone'; end if;
    begin
      insert into public.customers(name, phone) values (v_cust_name, v_cust_phone) returning id into v_cust_id;
    exception when unique_violation then
      raise exception 'customer name already exists — select the existing customer instead';
    end;
    v_cust_created := true;
  end if;

  -- 7. פרויקט — site אינו חלק מהזהות. קיים: חייב להשתייך ללקוח (site התיק לא ננעל ממנו).
  --    חדש: זהות (customer_id,name) נאכפת ב-DB; שם קיים → דחייה (בחר קיים); projects.site נשאר NULL.
  if v_has_ep then
    select id, name, customer_id into v_proj_id, v_proj_name, v_proj_cust
      from public.projects where id = (p_resolution->>'existing_project_id')::uuid;
    if v_proj_id is null then raise exception 'selected project not found'; end if;
    if v_proj_cust is distinct from v_cust_id then raise exception 'selected project does not belong to the selected customer'; end if;
  else
    v_proj_name := btrim(coalesce(v_cp->>'name',''));
    if length(v_proj_name) < 2 or length(v_proj_name) > 150 or v_proj_name ~ '[[:cntrl:]]' then raise exception 'invalid project name'; end if;
    -- projects.site נשאר NULL (legacy/אינפורמטיבי) — האתר הסמכותי הוא return_cases.site.
    -- אכיפת ייחוד (customer_id,name) ברמת DB (uq_projects_customer_name) — בטוח-למקביליות, ללא מיזוג שקט.
    begin
      insert into public.projects(customer_id, name) values (v_cust_id, v_proj_name) returning id into v_proj_id;
    exception when unique_violation then
      raise exception 'project name already exists for this customer — select the existing project instead';
    end;
    v_proj_created := true;
  end if;

  -- 8. return_case יחיד — site מה-resolution (עצמאי/סמכותי); מזהה בטוח-למקביליות.
  perform pg_advisory_xact_lock(hashtext('sba_return_case_id')::bigint);
  v_year := extract(year from now())::int;
  v_prefix := 'SBA-' || v_year || '-';
  for i in 1..5 loop
    select coalesce(max((regexp_replace(id, '^SBA-' || v_year || '-', ''))::int), 0) into v_max
      from public.return_cases where id ~ ('^SBA-' || v_year || '-[0-9]+$');
    v_id := v_prefix || lpad((v_max + 1)::text, 4, '0');
    begin
      insert into public.return_cases(
        id, customer_id, project_id, customer_name, project_name, site,
        contact_name, contact_phone, equipment_type, status, created_by
      ) values (
        v_id, v_cust_id, v_proj_id, v_cust_name, v_proj_name, v_site,
        v_contact, v_contact_phone, v_equip, 'open', public.current_app_role()
      );
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  -- 9. סימון מאושר + resolution סופי (payload לא משתנה) + קישור
  update public.customer_submissions
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(),
         created_case_id = v_id, return_case_id = v_id,
         resolution = jsonb_build_object(
           'customer_id', v_cust_id, 'customer_name', v_cust_name, 'customer_created', v_cust_created,
           'project_id', v_proj_id, 'project_name', v_proj_name, 'project_created', v_proj_created,
           'site', v_site, 'contact_name', v_contact, 'contact_phone', v_contact_phone,
           'equipment_type', v_equip, 'note', v_note)
   where id = p_submission_id;

  -- 10. audit עסקי יחיד
  insert into public.audit_logs(return_case_id, action_type, actor_id, actor_role, description, metadata_json, category)
  values (v_id, 'customer_intake_approved', auth.uid()::text, public.current_app_role(), 'אושרה בקשת לקוח חדש ונפתח תיק',
    jsonb_build_object('submission_id', v_sub.id,
      'original', jsonb_build_object('company', v_oc, 'project', v_op, 'site', v_os),
      'final', jsonb_build_object('customer_id', v_cust_id, 'customer_name', v_cust_name,
        'project_id', v_proj_id, 'project_name', v_proj_name, 'site', v_site,
        'contact_name', v_contact, 'contact_phone', v_contact_phone),
      'customer_reused', not v_cust_created, 'project_reused', not v_proj_created, 'case_id', v_id),
    'business');

  return jsonb_build_object('ok', true, 'case_id', v_id, 'customer_id', v_cust_id, 'project_id', v_proj_id,
                            'customer_created', v_cust_created, 'project_created', v_proj_created);
end;
$fn$;

revoke all on function public.approve_intake_request(uuid, jsonb) from public;
grant  execute on function public.approve_intake_request(uuid, jsonb) to authenticated;

-- ============================================================
-- הערות:
--   • site = ברמת התיק (return_cases.site), עצמאי — אותו (לקוח,פרויקט) במספר אתרים = מספר תיקים.
--   • איש-קשר/טלפון = ברמת התיק (return_cases.contact_name/contact_phone). טלפון לקוח גלובלי
--     נקבע רק ביצירת לקוח חדש; לקוח קיים לא נדרס.
--   • זהות פרויקט = (customer_id, name) — נאכפת ב-uq_projects_customer_name (בטוח-למקביליות).
--     create_project עם שם קיים ללקוח → דחייה (בחר קיים), ללא מיזוג שקט. projects.site נשאר NULL.
--   • note: ל-return_cases אין שדה note ייעודי (MVP) — נשמר ב-customer_submissions.resolution בלבד.
--   • payload מקורי נשמר; resolution סופי נפרד; client חסום מכתיבה ישירה (0008); audit immutable.
-- ============================================================
