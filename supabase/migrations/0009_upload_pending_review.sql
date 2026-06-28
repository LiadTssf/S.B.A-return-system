-- ============================================================
-- PART (Level-2) — upload_doc עובר לסקירת עובד.
-- אדיטיבי: create-or-replace ל-submit_customer_action בלבד. אין לערוך 0001-0008.
-- מיועד לסקירה והחלה ידנית. דורש: 0007 הורץ.
--
-- פער שזוהה: ב-0007, submit_customer_action קובע ל*שתי* פעולות הקובץ
--   (sign_policy + upload_doc) status='auto_applied'. הדרישה: upload_doc חייב
--   לעבור סקירת עובד (Level-2) → 'pending_review'; sign_policy נשאר 'auto_applied'
--   (זרימת חתימה מבוקרת). זה השינוי היחיד; שאר הפונקציה זהה ל-0007.
-- ============================================================

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
  c_max_bytes constant bigint := 15 * 1024 * 1024;  -- 15MB
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

    -- ── השינוי היחיד מ-0007 ──
    -- sign_policy: זרימת חתימה מבוקרת → auto_applied (משלים את שלב החתימה).
    -- upload_doc: מסמך תפעולי → pending_review (Level-2: דורש אישור עובד; המסמך
    --             נשמר מיד ב-case_documents, אך שלב ה-upload אינו מושלם עד אישור).
    v_status := case when v_tok.action_type = 'sign_policy' then 'auto_applied' else 'pending_review' end;
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

-- create-or-replace שומר את ה-ACL הקיים; מאשרים מחדש ליתר ביטחון (idempotent).
revoke all on function public.submit_customer_action(text, jsonb, text) from public;
grant  execute on function public.submit_customer_action(text, jsonb, text) to anon, authenticated;
