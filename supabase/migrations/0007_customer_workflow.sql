-- ============================================================
-- PART 5A — מחזור חיים אמיתי לטוקן לקוח + הגשות לקוח (customer_submissions)
--            + audit עסקי טרנזקציוני + מניעת ריבוי טוקנים פעילים.
-- אדיטיבי בלבד. אין לערוך 0001-0006. דורש: 0005+0006 הורצו.
-- מיועד לסקירה והחלה ידנית. בטוח לרירוּן (if exists / if not exists / DO-guards).
--
-- עקרונות אבטחה:
--   • anon אינו מקבל גישה ישירה לטבלאות/Storage — רק execute על שני RPC צרים
--     (validate_customer_token, submit_customer_action).
--   • issue/revoke/replace דורשים עובד פעיל תפעולי מאומת (coordinator/logistics/admin).
--   • נשמר רק hash של הטוקן (sha256). הטוקן הגולמי מוחזר פעם אחת בלבד (ב-issue/replace).
--   • הפונקציות הציבוריות גוזרות תיק/פעולה/סוג-מסמך/דלי/נתיב מהטוקן השמור — לא מקלט הלקוח.
--   • כל פעולה מצליחה כותבת אירוע audit עסקי יחיד באותה טרנזקציה (הכל-או-כלום).
--
-- הנחה: pgcrypto מותקן בסכימה extensions (ברירת המחדל של Supabase). אם הותקן
--        ב-public — יש לעדכן את ההסמכה extensions.* בהתאם. בדיקה:
--        select extname, nspname from pg_extension e
--          join pg_namespace n on n.oid = e.extnamespace where extname = 'pgcrypto';
-- ============================================================


-- ---------- (1) הרחבות ----------
create extension if not exists pgcrypto with schema extensions;


-- ---------- (2) עזר גיבוב פנימי (sha256) — לא נחשף ל-anon ----------
create or replace function public.hash_customer_token(p_token text)
  returns text
  language sql
  immutable
  set search_path = extensions, public, pg_temp
as $fn$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$fn$;
revoke all on function public.hash_customer_token(text) from public;


-- ---------- (3) הרחבת customer_tokens (אדיטיבי, nullable) ----------
alter table public.customer_tokens
  add column if not exists segment_id    uuid references public.truck_coordination(id) on delete set null,
  add column if not exists document_type text,
  add column if not exists issued_by     uuid references auth.users(id) on delete set null,
  add column if not exists revoked_at     timestamptz,
  add column if not exists revoked_by     uuid references auth.users(id) on delete set null,
  add column if not exists replaced_by    uuid references public.customer_tokens(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_tokens_action_type_chk') then
    alter table public.customer_tokens
      add constraint customer_tokens_action_type_chk
      check (action_type in ('intake_request','sign_policy','schedule','upload_doc','cancel_request'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_tokens_document_type_chk') then
    alter table public.customer_tokens
      add constraint customer_tokens_document_type_chk
      check (document_type is null
             or document_type in ('delivery_note','return_certificate','truck_photo','signed_policy','other'));
  end if;
end $$;


-- ---------- (4) הרחבת audit_logs — קטגוריה להפרדת אירוע עסקי מטכני/אבטחה ----------
-- ברירת מחדל 'business' (גם לשורות קיימות). התצוגה הדיפולטיבית תסונן ל-business
-- בשכבת ה-UI כדי לא להציף באירועים טכניים/אבטחה (שיתווספו בעתיד).
alter table public.audit_logs
  add column if not exists category text not null default 'business';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_logs_category_chk') then
    alter table public.audit_logs
      add constraint audit_logs_category_chk
      check (category in ('business','technical','security'));
  end if;
end $$;


-- ---------- (5) טבלה חדשה: customer_submissions ----------
create table if not exists public.customer_submissions (
  id                 uuid primary key default gen_random_uuid(),
  customer_token_id  uuid not null references public.customer_tokens(id) on delete cascade,
  return_case_id     text references public.return_cases(id) on delete cascade,
  action_type        text not null
                       check (action_type in ('intake_request','sign_policy','schedule','upload_doc','cancel_request')),
  payload            jsonb not null default '{}'::jsonb,
  status             text not null default 'pending_review'
                       check (status in ('pending_review','auto_applied','approved','rejected')),
  submitted_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references auth.users(id) on delete set null,
  review_note        text,
  created_at         timestamptz not null default now()
);


-- ---------- (6) הרחבת case_documents — קישור למקור הטוקן ----------
alter table public.case_documents
  add column if not exists customer_token_id uuid references public.customer_tokens(id) on delete set null;


-- ---------- (7) אינדקסים ואילוצי ייחודיות ----------
-- הגשה אחת לכל טוקן (חוסם הגשות כפולות ברמת DB).
create unique index if not exists uq_customer_submissions_token
  on public.customer_submissions(customer_token_id);
create index if not exists idx_customer_submissions_case
  on public.customer_submissions(return_case_id);
create index if not exists idx_customer_submissions_status
  on public.customer_submissions(status);

-- מניעת כפל-מסמך מאותו טוקן (כולל signed_policy). חלקי — לא נוגע במסמכים פנימיים.
create unique index if not exists uq_case_docs_token_doctype
  on public.case_documents(customer_token_id, document_type)
  where customer_token_id is not null;

create index if not exists idx_customer_tokens_status
  on public.customer_tokens(status);
create index if not exists idx_audit_category
  on public.audit_logs(category);

-- מניעת ריבוי טוקנים פעילים לאותה פעולה מותרת:
--   • פעולה ברמת תיק (ללא מקטע): ייחוד על (return_case_id, action_type).
--   • פעולה ברמת מקטע/משאית: ייחוד על (return_case_id, segment_id, action_type).
-- הפרדה זו מבטיחה שטוקן למשאית אחת אינו חוסם טוקן לגיטימי למשאית אחרת באותו תיק.
-- (intake_request ללא תיק: return_case_id=NULL → NULLs נחשבים שונים → לא נחסם.)
--
-- Preflight: (א) נרמול שורות שפג-תוקפן אך נותרו active → expired (לפני הבדיקה והאינדקס);
--            (ב) בדיקת כפילויות טוקנים פעילים קיימות. אם קיימות — עצירה עם חריגה ברורה.
--            אין מחיקה/ביטול/שכתוב אוטומטי של רשומות (נדרש ניקוי ידני).
do $$
declare
  v_norm int; v_dup_case int; v_dup_seg int;
begin
  update public.customer_tokens
     set status = 'expired'
   where status = 'active' and expires_at <= now();
  get diagnostics v_norm = row_count;
  raise notice '0007 preflight: normalized % expired-but-active token(s) to expired', v_norm;

  select count(*) into v_dup_case from (
    select return_case_id, action_type
      from public.customer_tokens
     where status = 'active' and segment_id is null
     group by return_case_id, action_type having count(*) > 1
  ) d;
  select count(*) into v_dup_seg from (
    select return_case_id, segment_id, action_type
      from public.customer_tokens
     where status = 'active' and segment_id is not null
     group by return_case_id, segment_id, action_type having count(*) > 1
  ) d;

  if v_dup_case > 0 or v_dup_seg > 0 then
    raise exception
      'cannot create active-token unique indexes: % case-level + % segment-level duplicate active-token group(s) exist. Manual cleanup required (no auto-delete/revoke).',
      v_dup_case, v_dup_seg;
  end if;
end $$;

create unique index if not exists uq_active_token_case_action
  on public.customer_tokens(return_case_id, action_type)
  where status = 'active' and segment_id is null;
create unique index if not exists uq_active_token_segment_action
  on public.customer_tokens(return_case_id, segment_id, action_type)
  where status = 'active' and segment_id is not null;


-- ---------- (8) RLS על customer_submissions ----------
-- SELECT = עובד פעיל · UPDATE (סקירה) = תפעולי. INSERT/DELETE — אין policy
-- (יצירה רק דרך RPC SECURITY DEFINER; אין כתיבה ישירה מהלקוח).
alter table public.customer_submissions enable row level security;

drop policy if exists customer_submissions_select on public.customer_submissions;
create policy customer_submissions_select on public.customer_submissions
  for select to authenticated using (public.is_active_employee());

drop policy if exists customer_submissions_update on public.customer_submissions;
create policy customer_submissions_update on public.customer_submissions
  for update to authenticated
  using (public.current_app_role() in ('coordinator','logistics','admin'))
  with check (public.current_app_role() in ('coordinator','logistics','admin'));


-- ---------- (9) הרשאות טבלה (grants/revokes) ----------
-- חובה: 0003 מעניק לטבלאות חדשות הרשאות ל-anon אוטומטית (alter default privileges).
revoke all on public.customer_submissions from anon;

-- עובד מאומת: קריאה+עדכון (סקירה) בלבד; יצירה/מחיקה רק דרך ה-RPC.
revoke all on public.customer_submissions from authenticated;
grant select, update on public.customer_submissions to authenticated;

-- חיזוק: כתיבה ל-customer_tokens רק דרך ה-RPCs (issue/revoke/replace).
-- שלילת כתיבה ישירה גם מעובד מאומת — נשארת קריאה בלבד (תצוגת טוקנים בכרטיס).
revoke insert, update, delete on public.customer_tokens from authenticated;


-- ============================================================
-- (10) פונקציות RPC
-- ============================================================

-- ---------- 10.1 _create_customer_token (פנימי בלבד — ללא audit, ללא בדיקת הרשאה) ----------
-- ליבת יצירת טוקן משותפת ל-issue ול-replace. אינו נחשף לאף תפקיד (revoke from public);
-- נקרא רק ע"י העטיפות SECURITY DEFINER (רצות כבעלים). מפריד יצירה מ-audit כדי
-- ש-replace ייצר אירוע 'replaced' יחיד ולא 'issued'+'revoked' נפרדים.
create or replace function public._create_customer_token(
  p_case_id       text,
  p_action_type   text,
  p_segment_id    uuid,
  p_document_type text,
  p_ttl_hours     int
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $fn$
declare
  v_raw      text;
  v_hash     text;
  v_ttl      int;
  v_doctype  text := p_document_type;
  v_customer uuid;
  v_id       uuid;
  v_expires  timestamptz;
begin
  if p_action_type not in ('intake_request','sign_policy','schedule','upload_doc','cancel_request') then
    raise exception 'invalid action_type';
  end if;

  -- TTL: ברירת מחדל 24ש', מינ' 1ש', תקרה 168ש' (7 ימים).
  v_ttl := coalesce(p_ttl_hours, 24);
  if v_ttl < 1   then v_ttl := 1;   end if;
  if v_ttl > 168 then v_ttl := 168; end if;

  -- סוג מסמך — רק לפעולות קובץ, נקבע בצד שרת.
  if p_action_type = 'sign_policy' then
    v_doctype := coalesce(v_doctype, 'signed_policy');
  elsif p_action_type = 'upload_doc' then
    if v_doctype is null then
      raise exception 'document_type required for upload_doc';
    end if;
  else
    v_doctype := null;
  end if;
  if v_doctype is not null
     and v_doctype not in ('delivery_note','return_certificate','truck_photo','signed_policy','other') then
    raise exception 'invalid document_type';
  end if;

  -- אימות תיק (אם נדרש) ושליפת הלקוח לדנורמליזציה.
  if p_case_id is not null then
    select customer_id into v_customer from public.return_cases where id = p_case_id;
    if not found then
      raise exception 'case not found';
    end if;
  elsif p_action_type <> 'intake_request' then
    raise exception 'case required';
  end if;

  -- אימות בעלות מקטע: אם נמסר segment — חייב תיק, והמקטע חייב להשתייך לאותו תיק.
  -- מונע צירוף טוקן של תיק אחד עם תיאום-משאית של תיק אחר.
  if p_segment_id is not null then
    if p_case_id is null then
      raise exception 'segment requires a case';
    end if;
    perform 1 from public.truck_coordination
     where id = p_segment_id and return_case_id = p_case_id;
    if not found then
      raise exception 'segment does not exist or does not belong to this case';
    end if;
  end if;

  -- טוקן גולמי 256-bit — מוחזר פעם אחת; נשמר רק ה-hash.
  -- אינדקסי הייחוד החלקיים (uq_active_token_*) הם המחסום הקשיח נגד ריבוי טוקנים פעילים.
  v_raw     := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash    := public.hash_customer_token(v_raw);
  v_expires := now() + make_interval(hours => v_ttl);

  insert into public.customer_tokens(
    token_hash, return_case_id, customer_id, action_type, segment_id,
    document_type, status, expires_at, issued_by
  ) values (
    v_hash, p_case_id, v_customer, p_action_type, p_segment_id,
    v_doctype, 'active', v_expires, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'token', v_raw,
    'token_id', v_id,
    'action_type', p_action_type,
    'document_type', v_doctype,
    'expires_at', v_expires
  );
end;
$fn$;
revoke all on function public._create_customer_token(text, text, uuid, text, int) from public;


-- ---------- 10.2 validate_customer_token (ציבורי ל-anon) ----------
-- קלט:  p_token (גולמי).
-- פלט:  jsonb — רק המידע המינימלי הנדרש ללקוח לפעולה המותרת.
--        תקין:   { valid:true, action_type, document_type, project_name, site, expires_at }
--        לא תקין:{ valid:false, reason: not_found|expired|consumed|revoked }
-- אבטחה: SECURITY DEFINER, search_path קבוע. קריאה בלבד (אינו צורך טוקן).
--        אינו מחזיר מזהה-תיק פנימי/מזהה-טוקן/hash/נתונים רגישים.
create or replace function public.validate_customer_token(p_token text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $fn$
declare
  v_hash text;
  v_tok  public.customer_tokens%rowtype;
  v_case public.return_cases%rowtype;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  v_hash := public.hash_customer_token(p_token);

  select * into v_tok from public.customer_tokens where token_hash = v_hash;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_tok.status = 'used' then
    return jsonb_build_object('valid', false, 'reason', 'consumed');
  elsif v_tok.status = 'revoked' then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  elsif v_tok.status = 'expired' or v_tok.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  elsif v_tok.status <> 'active' then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  -- הקשר אנושי מינימלי (פרויקט/אתר) — לא מזהה התיק הפנימי.
  if v_tok.return_case_id is not null then
    select * into v_case from public.return_cases where id = v_tok.return_case_id;
    if not found then
      return jsonb_build_object('valid', false, 'reason', 'not_found');
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'action_type', v_tok.action_type,
    'document_type', v_tok.document_type,
    'project_name', v_case.project_name,
    'site', v_case.site,
    'expires_at', v_tok.expires_at
  );
end;
$fn$;


-- ---------- 10.3 submit_customer_action (ציבורי ל-anon) ----------
-- קלט:  p_token (גולמי) · p_payload (נתוני הפעולה; ללא מזהי-תיק/פעולה/סוג/דלי/נתיב מהימנים)
--        · p_object_path (אופציונלי; אם נמסר חייב להיות זהה בדיוק לנתיב הנגזר בשרת).
-- פלט:  jsonb { ok:true, submission_id, action_type, status }.
-- אבטחה: SECURITY DEFINER. כל ההקשר (תיק/פעולה/מזהה-טוקן/סוג-מסמך/דלי/נתיב) נגזר מהטוקן.
-- אטומיות: הגשה + מטא-מסמך + צריכת טוקן + audit עסקי — הכל בטרנזקציה אחת; כשל→rollback→
--          הטוקן נשאר active (לא נצרך).
-- פעולות קובץ: אימות דלי+נתיב נגזר+קיום אובייקט+סוג מסמך+MIME מותר+גודל מקסימלי,
--              ושאיבת file_name/mime_type/size_bytes/bucket_name/object_path בצד שרת.
create or replace function public.submit_customer_action(
  p_token       text,
  p_payload     jsonb default '{}'::jsonb,
  p_object_path text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $fn$
declare
  c_bucket    constant text   := 'case-documents';
  c_max_bytes constant bigint := 15 * 1024 * 1024;  -- 15MB (תקרת גודל; ניתן לכוונון)
  v_hash      text;
  v_tok       public.customer_tokens%rowtype;
  v_case_id   text;
  v_doctype   text;
  v_expected  text;
  v_obj       record;
  v_allowed   text[];
  v_file_name text;
  v_title     text;
  v_status    text;
  v_audit     text;
  v_descr     text;
  v_sub_id    uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid token';
  end if;

  v_hash := public.hash_customer_token(p_token);

  -- נעילת שורת הטוקן (סדרוּר הגשות מקבילות על אותו טוקן).
  select * into v_tok from public.customer_tokens where token_hash = v_hash for update;
  if not found then
    raise exception 'invalid token';
  end if;
  if v_tok.status <> 'active' or v_tok.expires_at <= now() then
    raise exception 'token is not usable';
  end if;

  -- כל ההקשר נגזר מהטוקן בלבד.
  v_case_id := v_tok.return_case_id;
  v_doctype := v_tok.document_type;

  -- אימות עקביות מקטע↔תיק (שניהם מהטוקן, אך מוודאים שהיחס עדיין תקף בעת ההגשה).
  if v_tok.segment_id is not null then
    perform 1 from public.truck_coordination
     where id = v_tok.segment_id and return_case_id = v_case_id;
    if not found then
      raise exception 'segment/case mismatch';
    end if;
  end if;

  if v_tok.action_type in ('sign_policy','upload_doc') then
    -- ===== פעולת קובץ =====
    if v_tok.action_type = 'sign_policy' then
      v_doctype := coalesce(v_doctype, 'signed_policy');
    end if;
    if v_doctype is null then
      raise exception 'document type not set on token';
    end if;
    if v_case_id is null then
      raise exception 'file action requires a case';
    end if;

    -- נתיב היעד נגזר משרת בלבד ומאומת בדיוק (לא בדיקת-תחילית חלשה).
    v_expected := v_case_id || '/customer/' || v_tok.id::text || '/' || v_doctype;
    if p_object_path is not null and p_object_path <> v_expected then
      raise exception 'object path mismatch';
    end if;

    -- ודא קיום האובייקט בדלי הצפוי ובנתיב הנגזר; שאיבת mime/size מ-metadata בצד שרת.
    select o.name,
           nullif(o.metadata->>'size','')::bigint as size_bytes,
           o.metadata->>'mimetype'                as mime_type
      into v_obj
      from storage.objects o
     where o.bucket_id = c_bucket and o.name = v_expected;
    if not found then
      raise exception 'uploaded file not found in storage';
    end if;

    -- MIME מותר לפי סוג המסמך (נקרא מ-Storage, לא מקלט הלקוח).
    v_allowed := case v_doctype
      when 'truck_photo'   then array['image/jpeg','image/png','image/webp']
      when 'signed_policy' then array['application/pdf','image/png','image/jpeg']
      else                      array['application/pdf','image/jpeg','image/png','image/webp']
    end;
    if v_obj.mime_type is null or not (v_obj.mime_type = any(v_allowed)) then
      raise exception 'mime type not permitted for this document';
    end if;

    -- גודל מותר.
    if v_obj.size_bytes is null or v_obj.size_bytes <= 0 or v_obj.size_bytes > c_max_bytes then
      raise exception 'file size not permitted';
    end if;

    -- שם קובץ/כותרת לתצוגה בלבד — שם המקור מהלקוח מנוקה (ללא מפרידי-נתיב/בקרה),
    -- מוגבל אורך. מפתח ה-Storage נשאר הנתיב הנגזר בשרת (אינו תלוי בשם המקורי).
    v_file_name := coalesce(nullif(p_payload->>'fileName',''), v_doctype);
    v_file_name := replace(replace(v_file_name, '/', '_'), '\', '_');
    v_file_name := left(regexp_replace(v_file_name, '[[:cntrl:]]', '', 'g'), 200);
    v_title := nullif(left(regexp_replace(coalesce(p_payload->>'title',''), '[[:cntrl:]]', '', 'g'), 200), '');

    insert into public.case_documents(
      return_case_id, segment_id, document_type, file_name,
      storage_provider, bucket_name, object_path, mime_type, size_bytes,
      uploaded_by, customer_token_id, title
    ) values (
      v_case_id, v_tok.segment_id, v_doctype, v_file_name,
      'supabase', c_bucket, v_expected, v_obj.mime_type, v_obj.size_bytes,
      'customer', v_tok.id, v_title
    );
    v_status := 'auto_applied';
  else
    -- ===== פעולות ללא קובץ (schedule/cancel_request/intake_request) → לסקירת עובד =====
    v_status := 'pending_review';
  end if;

  -- הגשה אחת לכל טוקן (unique) — חוסם כפילויות.
  insert into public.customer_submissions(
    customer_token_id, return_case_id, action_type, payload, status
  ) values (
    v_tok.id, v_case_id, v_tok.action_type, coalesce(p_payload, '{}'::jsonb), v_status
  )
  returning id into v_sub_id;

  -- צריכת הטוקן.
  update public.customer_tokens
     set status = 'used', used_at = now()
   where id = v_tok.id;

  -- אירוע audit עסקי יחיד לפעולה (signed/uploaded/submitted), באותה טרנזקציה.
  if v_tok.action_type = 'sign_policy' then
    v_audit := 'customer_policy_signed';  v_descr := 'הלקוח חתם על נוהל ההחזרה';
  elsif v_tok.action_type = 'upload_doc' then
    v_audit := 'customer_document_uploaded'; v_descr := 'הלקוח העלה מסמך';
  else
    v_audit := 'customer_action_submitted'; v_descr := 'התקבלה הגשת לקוח';
  end if;

  insert into public.audit_logs(
    return_case_id, action_type, actor_id, actor_role, description, metadata_json, category
  ) values (
    v_case_id, v_audit, 'customer', 'customer', v_descr,
    jsonb_build_object(
      'token_id', v_tok.id, 'submission_id', v_sub_id, 'action', v_tok.action_type,
      'status', v_status, 'document_type', v_doctype, 'segment_id', v_tok.segment_id
    ),
    'business'
  );

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub_id,
    'action_type', v_tok.action_type,
    'status', v_status
  );
end;
$fn$;


-- ---------- 10.4 issue_customer_token (מאומת: עובד פעיל תפעולי) ----------
-- קלט:  p_case_id · p_action_type · p_segment_id? · p_document_type? · p_ttl_hours(=24).
-- פלט:  jsonb { token(גולמי, פעם אחת), token_id, action_type, document_type, expires_at }.
-- התנהגות: דחייה דטרמיניסטית אם כבר קיים טוקן פעיל לאותה פעולה (תיק/מקטע) — לא נוצר
--          טוקן פעיל נוסף בשקט. החלפה/ביטול מפורשים נדרשים.
create or replace function public.issue_customer_token(
  p_case_id       text,
  p_action_type   text,
  p_segment_id    uuid default null,
  p_document_type text default null,
  p_ttl_hours     int  default 24
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $fn$
declare
  v_res jsonb;
begin
  if auth.uid() is null
     or not public.is_active_employee()
     or public.current_app_role() not in ('coordinator','logistics','admin') then
    raise exception 'not authorized to issue customer tokens';
  end if;

  -- נרמול תפוגה: טוקן שפג-תוקפו אך נותר status='active' עלול לחסום הנפקה חדשה
  -- (אינדקס הייחוד בודק status='active' בלבד; אסור להשתמש ב-now() בתוך predicate של אינדקס).
  -- מנרמלים active→expired לאותו צירוף תיק/פעולה/מקטע לפני הבדיקה וההכנסה.
  update public.customer_tokens
     set status = 'expired'
   where return_case_id is not distinct from p_case_id
     and action_type = p_action_type
     and segment_id is not distinct from p_segment_id
     and status = 'active'
     and expires_at <= now();

  -- דחייה דטרמיניסטית: טוקן פעיל קיים לאותה פעולה מותרת (רמת תיק או רמת מקטע).
  if p_segment_id is null then
    if exists (select 1 from public.customer_tokens
                where return_case_id = p_case_id and action_type = p_action_type
                  and segment_id is null and status = 'active') then
      raise exception 'an active token already exists for this case action; revoke or replace it first';
    end if;
  else
    if exists (select 1 from public.customer_tokens
                where return_case_id = p_case_id and action_type = p_action_type
                  and segment_id = p_segment_id and status = 'active') then
      raise exception 'an active token already exists for this segment action; revoke or replace it first';
    end if;
  end if;

  v_res := public._create_customer_token(p_case_id, p_action_type, p_segment_id, p_document_type, p_ttl_hours);

  -- audit עסקי יחיד, אותה טרנזקציה.
  insert into public.audit_logs(
    return_case_id, action_type, actor_id, actor_role, description, metadata_json, category
  ) values (
    p_case_id, 'customer_token_issued', auth.uid()::text, public.current_app_role(), 'הונפק קישור לקוח',
    jsonb_build_object(
      'token_id', v_res->>'token_id', 'action', p_action_type,
      'segment_id', p_segment_id, 'document_type', v_res->>'document_type'
    ),
    'business'
  );

  return v_res;
end;
$fn$;


-- ---------- 10.5 revoke_customer_token (מאומת) ----------
create or replace function public.revoke_customer_token(p_token_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_tok public.customer_tokens%rowtype;
begin
  if auth.uid() is null
     or not public.is_active_employee()
     or public.current_app_role() not in ('coordinator','logistics','admin') then
    raise exception 'not authorized';
  end if;

  select * into v_tok from public.customer_tokens where id = p_token_id for update;
  if not found then
    raise exception 'token not found';
  end if;
  if v_tok.status <> 'active' then
    raise exception 'token not active';
  end if;

  update public.customer_tokens
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = p_token_id;

  insert into public.audit_logs(
    return_case_id, action_type, actor_id, actor_role, description, metadata_json, category
  ) values (
    v_tok.return_case_id, 'customer_token_revoked', auth.uid()::text, public.current_app_role(), 'בוטל קישור לקוח',
    jsonb_build_object('token_id', v_tok.id, 'action', v_tok.action_type, 'segment_id', v_tok.segment_id),
    'business'
  );

  return jsonb_build_object('ok', true);
end;
$fn$;


-- ---------- 10.6 replace_customer_token (מאומת) ----------
-- מבטל טוקן פעיל ומנפיק חדש עם אותו הקשר (TTL ברירת מחדל). אטומי.
-- מבטל תחילה כדי לספק את אינדקס ייחוד הטוקנים הפעילים, ואז יוצר. audit יחיד = 'replaced'.
create or replace function public.replace_customer_token(p_token_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $fn$
declare
  v_old public.customer_tokens%rowtype;
  v_new jsonb;
begin
  if auth.uid() is null
     or not public.is_active_employee()
     or public.current_app_role() not in ('coordinator','logistics','admin') then
    raise exception 'not authorized';
  end if;

  select * into v_old from public.customer_tokens where id = p_token_id for update;
  if not found then
    raise exception 'token not found';
  end if;
  if v_old.status <> 'active' then
    raise exception 'only active tokens can be replaced';
  end if;

  -- ביטול הישן תחילה (משחרר את ייחוד הטוקן הפעיל לפני יצירת החדש).
  update public.customer_tokens
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = v_old.id;

  v_new := public._create_customer_token(
    v_old.return_case_id, v_old.action_type, v_old.segment_id, v_old.document_type, 24
  );

  update public.customer_tokens
     set replaced_by = (v_new->>'token_id')::uuid
   where id = v_old.id;

  insert into public.audit_logs(
    return_case_id, action_type, actor_id, actor_role, description, metadata_json, category
  ) values (
    v_old.return_case_id, 'customer_token_replaced', auth.uid()::text, public.current_app_role(), 'הוחלף קישור לקוח',
    jsonb_build_object(
      'old_token_id', v_old.id, 'new_token_id', v_new->>'token_id',
      'action', v_old.action_type, 'segment_id', v_old.segment_id
    ),
    'business'
  );

  return v_new;
end;
$fn$;


-- ---------- (11) הרשאות הפונקציות ----------
-- ציבוריים ל-anon (צרים): validate + submit. שאר ה-RPCs — authenticated בלבד.
revoke all on function public.validate_customer_token(text)             from public;
grant  execute on function public.validate_customer_token(text)         to anon, authenticated;

revoke all on function public.submit_customer_action(text, jsonb, text) from public;
grant  execute on function public.submit_customer_action(text, jsonb, text) to anon, authenticated;

revoke all on function public.issue_customer_token(text, text, uuid, text, int) from public;
grant  execute on function public.issue_customer_token(text, text, uuid, text, int) to authenticated;

revoke all on function public.revoke_customer_token(uuid)  from public;
grant  execute on function public.revoke_customer_token(uuid)  to authenticated;

revoke all on function public.replace_customer_token(uuid) from public;
grant  execute on function public.replace_customer_token(uuid) to authenticated;


-- ============================================================
-- מגבלות ידועות עד למימוש ה-Edge Function (request-customer-upload):
--   • anon אינו יכול לכתוב ל-Storage (0006). לכן sign_policy/upload_doc יושלמו רק
--     לאחר ש-Edge Function (service key, צד-שרת בלבד) ינפיק signed-upload-URL לנתיב
--     <case_id>/customer/<token_id>/<document_type>. submit_customer_action כבר
--     מאמת דלי+נתיב+קיום+MIME+גודל מול אובייקט זה.
--   • זרימת signed_policy: דפדפן הלקוח מרכיב את המסמך הסופי (תמונה/PDF של הנוהל החתום)
--     ומעלה אותו דרך ה-signed-URL לנתיב הדטרמיניסטי. אין אחסון Base64 ב-JSON; ה-payload
--     נושא רק מטא-טקסט (שם חותם וכד'). הייחודיות (טוקן→הגשה אחת + customer_token_id,
--     document_type) מבטיחה מסמך signed_policy אמיתי יחיד לכל טוקן חתימה.
--   • service key לעולם לא ב-Vite/פרונט — רק בסודות ה-Edge Function בצד שרת.
--   • ניקוי יתומים: כשל ב-submit לאחר העלאה מותיר אובייקט יתום (עלות בלבד). הנתיב
--     דטרמיניסטי לכן ניסיון חוזר עם אותו טוקן דורס את אותו מפתח (אין הצטברות).
--     נדרש ניקוי תקופתי לטוקנים נטושים.
--   • audit טכני/אבטחה (ניסיונות כושלים): אינם נרשמים כאן (rollback מבטל). שייכים
--     ל-Edge Function/gateway/שכבת השירותים, בקטגוריה 'technical'/'security'.
-- ============================================================
