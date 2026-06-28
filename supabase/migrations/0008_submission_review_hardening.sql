-- ============================================================
-- PART 5B (תנאי מקדים) — חיזוק סקירת הגשות לקוח + ניקוי הרשאות authenticated.
-- אדיטיבי בלבד. אין לערוך 0001-0007. דורש: 0005+0006+0007 הורצו.
-- מיועד לסקירה והחלה ידנית. בטוח לרירוּן (create or replace / if exists / idempotent).
--
-- בעיה שמטופלת: מדיניות 0007 התירה לעובד תפעולי UPDATE על כל עמודה ב-
-- customer_submissions (RLS שולט בתפקיד, לא בעמודות). כאן סוגרים זאת:
--   • סקירה מתבצעת רק דרך RPC SECURITY DEFINER שמעדכן 4 שדות בלבד.
--   • כתיבה ישירה (UPDATE) ל-customer_submissions נשללת מ-authenticated.
-- בנוסף: ניקוי TRUNCATE/REFERENCES/TRIGGER שירשו מ-0003 (לא נדרשים, לא דרך PostgREST).
-- ============================================================


-- ---------- (1) RPC סקירת הגשה (מאומת: עובד פעיל תפעולי) ----------
-- קלט:  p_submission_id · p_status ('approved'|'rejected') · p_review_note?
-- פלט:  jsonb { ok, submission_id, status }.
-- אבטחה: SECURITY DEFINER, search_path קבוע, schema-qualified, ללא SQL דינמי.
-- אכיפה: רק מעבר pending_review → approved|rejected; נועל את השורה (for update).
-- עדכון: status, reviewed_at=now(), reviewed_by=auth.uid(), review_note — ותו לא.
--        customer_token_id/return_case_id/action_type/payload/submitted_at/created_at
--        אינם ניתנים לשינוי (הפונקציה אינה נוגעת בהם + UPDATE ישיר נשלל למטה).
-- אטומיות: עדכון + audit עסקי יחיד באותה טרנזקציה; כשל → rollback.
create or replace function public.review_customer_submission(
  p_submission_id uuid,
  p_status        text,
  p_review_note   text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_sub  public.customer_submissions%rowtype;
  v_note text;
begin
  -- הרשאה
  if auth.uid() is null
     or not public.is_active_employee()
     or public.current_app_role() not in ('coordinator','logistics','admin') then
    raise exception 'not authorized to review submissions';
  end if;

  -- יעד חוקי בלבד
  if p_status not in ('approved','rejected') then
    raise exception 'invalid review status';
  end if;

  -- נעילת השורה + אכיפת מעבר חוקי (רק מ-pending_review)
  select * into v_sub from public.customer_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission not found';
  end if;
  if v_sub.status <> 'pending_review' then
    raise exception 'submission is not pending review';
  end if;

  v_note := nullif(btrim(left(coalesce(p_review_note, ''), 1000)), '');

  -- עדכון שדות הסקירה בלבד
  update public.customer_submissions
     set status      = p_status,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = v_note
   where id = p_submission_id;

  -- audit עסקי יחיד, אותה טרנזקציה
  insert into public.audit_logs(
    return_case_id, action_type, actor_id, actor_role, description, metadata_json, category
  ) values (
    v_sub.return_case_id,
    case when p_status = 'approved' then 'customer_submission_approved'
         else 'customer_submission_rejected' end,
    auth.uid()::text, public.current_app_role(),
    case when p_status = 'approved' then 'אושרה הגשת לקוח' else 'נדחתה הגשת לקוח' end,
    jsonb_build_object('submission_id', v_sub.id, 'action', v_sub.action_type, 'status', p_status),
    'business'
  );

  return jsonb_build_object('ok', true, 'submission_id', v_sub.id, 'status', p_status);
end;
$fn$;


-- ---------- (2) הרשאת הפונקציה: authenticated בלבד ----------
revoke all on function public.review_customer_submission(uuid, text, text) from public;
grant  execute on function public.review_customer_submission(uuid, text, text) to authenticated;


-- ---------- (3) סגירת כתיבה ישירה ל-customer_submissions ----------
-- סקירה רק דרך ה-RPC. לעובד מאומת — קריאה בלבד.
revoke update on public.customer_submissions from authenticated;
grant  select on public.customer_submissions to authenticated;
-- הסרת מדיניות ה-UPDATE שהפכה מיותרת (אין יותר הרשאת UPDATE לגבותה; ה-RPC רץ כ-definer).
drop policy if exists customer_submissions_update on public.customer_submissions;


-- ---------- (4) ניקוי הרשאות authenticated שירשו מ-0003 (לא נדרשות) ----------
-- TRUNCATE/REFERENCES/TRIGGER אינם נחשפים דרך PostgREST ואינם נדרשים ללקוח.
-- כולל את הטבלאות התפעוליות + profiles (ירשה את אותן הרשאות רחבות מ-0003;
-- אינה "תפעולית" אך מנקים גם אותה — הסר מהרשימה אם אינך רוצה).
do $$
declare t text;
begin
  foreach t in array array[
    'customers','projects','return_cases','truck_coordination',
    'case_documents','action_items','audit_logs','customer_tokens',
    'customer_submissions','profiles'
  ] loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated;', t);
  end loop;
end $$;

-- ============================================================
-- הערות:
--   • שירותי 5B: setSubmissionStatus באדפטר חייב לקרוא ל-review_customer_submission;
--     אסור UPDATE ישיר ל-customer_submissions.
--   • יישום בקשה מאושרת לרשומות תפעוליות (יצירת segment ל-schedule מאושר,
--     ביטול תיק ל-cancel מאושר) נשאר פעולת-עובד נפרדת דרך האדפטרים הקיימים —
--     ה-RPC הזה מטפל אך ורק במעבר הסטטוס + audit (לפי הדרישה לעדכן 4 שדות בלבד).
--   • service_role נשאר עם הרשאות מלאות (צד-שרת). anon — ללא גישה (0006).
-- ============================================================
