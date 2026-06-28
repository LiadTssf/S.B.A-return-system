-- ============================================================
-- verify-0007.sql — אימות התנהגות 0007. להריץ ב-SQL Editor (כ-postgres) *אחרי* החלת 0007.
-- מחזיר טבלת תוצאות ב-Results (לא RAISE NOTICE). עטוף BEGIN … ROLLBACK → אין שאריות.
--
-- ה-SELECT האחרון (לפני ROLLBACK) הוא תוצאת ה-Results. ה-ROLLBACK מנקה הכל
-- (נתוני בדיקה, רשומות audit, והטבלה הזמנית).
--
-- מדוע SQL ולא smoke client: כדי "להפוך טוקן לפג-תוקף" צריך לעדכן expires_at ישירות,
-- אך 0007 שלל כתיבה ישירה ל-customer_tokens מ-authenticated, ו-TTL נחתך ל-≥1ש'.
-- לכן הבדיקה רצה כ-postgres (owner) ומדמה auth.uid() של עובד פעיל דרך request.jwt.claims.
-- ============================================================
begin;

-- טבלה זמנית לאיסוף תוצאות (נמחקת ב-ROLLBACK).
create temp table _vr (seq int, test_name text, status text, details text);

-- ---------- SETUP: סימולציית הזדהות עובד תפעולי פעיל ----------
do $$
declare v_uid uuid;
begin
  select user_id into v_uid from public.profiles
   where is_active and role in ('coordinator','logistics','admin')
   order by role limit 1;
  if v_uid is null then
    insert into _vr values (0, 'SETUP', 'FAIL', 'no active operational employee in profiles');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
    insert into _vr values (0, 'SETUP', 'PASS', 'simulating an active operational employee');
  end if;
end $$;

-- ---------- בדיקה A: טוקן שפג-תוקפו אינו חוסם הנפקה חדשה ----------
do $$
declare v_status text := 'FAIL'; v_details text := '';
        v_a jsonb; v_b jsonb; v_active int; v_expired int;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    insert into _vr values (1, 'PASS A: expired token does not block new issuance', 'SKIP', 'no auth configured'); return;
  end if;
  begin
    insert into public.customers(name) values ('VERIFY-0007 CO') on conflict (name) do nothing;
    insert into public.return_cases(id, customer_name, project_name, site, equipment_type, status, created_by)
      values ('VERIFY-A-CASE', 'VERIFY-0007 CO', 'בדיקה A', '—', 'rental', 'open', 'verify') on conflict (id) do nothing;

    v_a := public.issue_customer_token('VERIFY-A-CASE', 'schedule');          -- 1) הנפקת A
    update public.customer_tokens set expires_at = now() - interval '1 hour'  -- 2) הפיכתו לפג-תוקף
       where id = (v_a->>'token_id')::uuid;
    v_b := public.issue_customer_token('VERIFY-A-CASE', 'schedule');          -- 3) הנפקת B לאותה פעולה

    select count(*) into v_active  from public.customer_tokens
       where return_case_id = 'VERIFY-A-CASE' and action_type = 'schedule' and status = 'active';
    select count(*) into v_expired from public.customer_tokens
       where return_case_id = 'VERIFY-A-CASE' and action_type = 'schedule' and status = 'expired';

    if v_active = 1 and v_expired >= 1 then                                   -- 4) אימות
      v_status := 'PASS'; v_details := format('active=%s, expired=%s', v_active, v_expired);
    else
      v_status := 'FAIL'; v_details := format('expected active=1 & expired>=1; got active=%s, expired=%s', v_active, v_expired);
    end if;
  exception when others then
    v_status := 'FAIL'; v_details := 'unexpected error: ' || left(sqlerrm, 100);
  end;
  insert into _vr values (1, 'PASS A: expired token does not block new issuance', v_status, v_details);
end $$;

-- ---------- בדיקה B: הנפקה כפולה של טוקן פעיל נדחית ----------
do $$
declare v_status text := 'FAIL'; v_details text := '';
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    insert into _vr values (2, 'PASS B: duplicate active token is rejected', 'SKIP', 'no auth configured'); return;
  end if;
  begin
    insert into public.return_cases(id, customer_name, project_name, site, equipment_type, status, created_by)
      values ('VERIFY-B-CASE', 'VERIFY-0007 CO', 'בדיקה B', '—', 'rental', 'open', 'verify') on conflict (id) do nothing;
    perform public.issue_customer_token('VERIFY-B-CASE', 'schedule');         -- טוקן פעיל ראשון
    begin
      perform public.issue_customer_token('VERIFY-B-CASE', 'schedule');       -- כפילות → אמורה להידחות
      v_status := 'FAIL'; v_details := 'duplicate active token was NOT rejected';
    exception when others then
      v_status := 'PASS'; v_details := 'rejected: ' || left(sqlerrm, 90);
    end;
  exception when others then
    v_status := 'FAIL'; v_details := 'setup error: ' || left(sqlerrm, 100);
  end;
  insert into _vr values (2, 'PASS B: duplicate active token is rejected', v_status, v_details);
end $$;

-- ---------- בדיקה C: מקטע של תיק אחר נדחה ----------
do $$
declare v_status text := 'FAIL'; v_details text := ''; v_seg uuid;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    insert into _vr values (3, 'PASS C: segment from another case is rejected', 'SKIP', 'no auth configured'); return;
  end if;
  begin
    insert into public.return_cases(id, customer_name, project_name, site, equipment_type, status, created_by)
      values ('VERIFY-C-CASE', 'VERIFY-0007 CO', 'בדיקה C', '—', 'rental', 'open', 'verify') on conflict (id) do nothing;
    insert into public.return_cases(id, customer_name, project_name, site, equipment_type, status, created_by)
      values ('VERIFY-C-OTHER', 'VERIFY-0007 CO', 'תיק אחר', '—', 'rental', 'open', 'verify') on conflict (id) do nothing;
    insert into public.truck_coordination(return_case_id, status) values ('VERIFY-C-OTHER', 'planned') returning id into v_seg;
    begin
      perform public.issue_customer_token('VERIFY-C-CASE', 'upload_doc', v_seg, 'delivery_note'); -- מקטע של OTHER → אמור להידחות
      v_status := 'FAIL'; v_details := 'foreign-case segment was NOT rejected';
    exception when others then
      v_status := 'PASS'; v_details := 'rejected: ' || left(sqlerrm, 90);
    end;
  exception when others then
    v_status := 'FAIL'; v_details := 'setup error: ' || left(sqlerrm, 100);
  end;
  insert into _vr values (3, 'PASS C: segment from another case is rejected', v_status, v_details);
end $$;

-- ---------- OVERALL ----------
do $$
declare v_pass int; v_total int;
begin
  select count(*) filter (where status = 'PASS'), count(*) into v_pass, v_total from _vr where seq between 1 and 3;
  insert into _vr values (99, 'OVERALL',
    case when v_pass = 3 then 'PASS' else 'FAIL' end,
    format('%s/%s checks passed', v_pass, v_total));
end $$;

-- ---------- תוצאה ב-Results ----------
select test_name, status, details from _vr order by seq;

rollback;  -- מנקה את כל נתוני הבדיקה, רשומות ה-audit, והטבלה הזמנית
