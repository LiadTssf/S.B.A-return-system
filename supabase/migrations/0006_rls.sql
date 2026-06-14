-- ============================================================
-- PART 4.5 / שלב 2 — RLS לפי המטריצה המאושרת.
-- אדיטיבי. אין לערוך 0001-0005. דורש: 0005 הורץ + קיימים משתמשי Auth עם פרופיל פעיל.
--
-- מטריצה:
--   טבלאות תפעוליות (customers/projects/return_cases/truck_coordination/
--     case_documents/action_items/customer_tokens):
--       SELECT = עובד פעיל (is_active_employee)
--       INSERT/UPDATE/DELETE = coordinator/logistics/admin (current_app_role)
--   audit_logs: SELECT+INSERT = עובד פעיל ; ללא UPDATE/DELETE (immutable)
--   Storage case-documents: SELECT = עובד פעיל ; INSERT/UPDATE/DELETE = coordinator/logistics/admin
--   anon: אין גישה ישירה לטבלאות. גישת לקוח חיצוני תיפתח רק ב-PART 5 דרך RPC צרים.
--   factory_manager: קריאה בלבד (אינו ב-OPERATIONAL).
--   DELETE נשמר ל-coordinator/logistics/admin — תואם להתנהגות הקיימת ב-UI.
-- ============================================================

-- ---------- 1. מדיניות לטבלאות התפעוליות (כולל הסרת dev_all) ----------
do $$
declare
  t text;
  op constant text := 'public.current_app_role() in (''coordinator'',''logistics'',''admin'')';
begin
  foreach t in array array[
    'customers','projects','return_cases','truck_coordination',
    'case_documents','action_items','customer_tokens'
  ] loop
    execute format('drop policy if exists dev_all on public.%I;', t);

    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.is_active_employee());',
      t, t);

    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (%s);',
      t, t, op);

    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (%s) with check (%s);',
      t, t, op, op);

    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (%s);',
      t, t, op);
  end loop;
end $$;

-- ---------- 2. audit_logs — קריאה+כתיבה לעובד פעיל, ללא עדכון/מחיקה ----------
drop policy if exists dev_all on public.audit_logs;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_active_employee());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated with check (public.is_active_employee());
-- (אין מדיניות UPDATE/DELETE → חסום. בנוסף revoke מפורש למטה.)

-- ---------- 3. Storage: bucket case-documents ----------
drop policy if exists dev_case_documents_all on storage.objects;

drop policy if exists case_docs_select on storage.objects;
create policy case_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'case-documents' and public.is_active_employee());

drop policy if exists case_docs_insert on storage.objects;
create policy case_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'case-documents' and public.current_app_role() in ('coordinator','logistics','admin'));

drop policy if exists case_docs_update on storage.objects;
create policy case_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'case-documents' and public.current_app_role() in ('coordinator','logistics','admin'))
  with check (bucket_id = 'case-documents' and public.current_app_role() in ('coordinator','logistics','admin'));

drop policy if exists case_docs_delete on storage.objects;
create policy case_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'case-documents' and public.current_app_role() in ('coordinator','logistics','admin'));

-- ---------- 4. שלילת גישת anon ישירה + audit immutable ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- anon שומר usage על schema + execute על פונקציות העזר (וב-PART 5 על RPC צרים)
grant usage on schema public to anon;

-- audit_logs immutable מהלקוח (חסינות כפולה מעבר לחוסר מדיניות)
revoke update, delete on public.audit_logs from anon, authenticated;
