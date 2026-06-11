-- ============================================================
-- S.B.A. Return Management — סכימת ליבה (Day 2)
-- מסד נתונים: PostgreSQL (Supabase)
-- גרסה: 0001 — טבלאות ליבה בלבד. נורמליזציה מינימלית ומעשית.
-- הערה: RLS מופעל עם מדיניות פתוחה לפיתוח בלבד.
--        TODO: להחליף במדיניות לפי תפקיד + Supabase Auth לפני פרודקשן.
-- ============================================================

-- ---------- לקוחות ----------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---------- פרויקטים ----------
create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references customers(id) on delete set null,
  name         text not null,
  site         text,
  created_at   timestamptz not null default now()
);

-- ---------- תיקי החזרה ----------
-- מזהה התיק הוא מספר התיק הקריא (SBA-YYYY-NNNN) כדי לשמר את חוזה ה-UI/ראוטים.
-- שמות הלקוח/פרויקט נשמרים גם דנורמלית לפשטות תצוגה (לצד FK אופציונלי).
create table if not exists return_cases (
  id              text primary key,
  customer_id     uuid references customers(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  customer_name   text not null,
  project_name    text not null,
  site            text not null,
  equipment_type  text not null check (equipment_type in ('rental','customer_owned','rental_and_customer')),
  status          text not null default 'open'
                    check (status in ('open','coordinating','awaiting_return','in_review','completed','cancelled')),
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  closed_by       text
);
create index if not exists idx_return_cases_status on return_cases(status);
create index if not exists idx_return_cases_updated on return_cases(updated_at desc);

-- ---------- תיאום משאיות (segments) ----------
-- תיק יכול להכיל מספר תיאומי משאית (1-to-many).
create table if not exists truck_coordination (
  id                  uuid primary key default gen_random_uuid(),
  return_case_id      text not null references return_cases(id) on delete cascade,
  planned_date        date,
  truck_id            text,
  driver_name         text,
  driver_phone        text,
  actual_date         date,
  customer_confirmed  boolean not null default false,
  status              text not null default 'planned'
                        check (status in ('planned','confirmed','returned_to_plant','completed','closed','cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_truck_coord_case on truck_coordination(return_case_id);
create index if not exists idx_truck_coord_planned on truck_coordination(planned_date);

-- ---------- מסמכים (metadata) ----------
-- הקובץ עצמו נשמר ב-Supabase Storage (bucket: case-documents).
-- כאן נשמר רק ה-metadata + object_path. שדות בדיוק לפי המפרט.
create table if not exists case_documents (
  id              uuid primary key default gen_random_uuid(),
  return_case_id  text not null references return_cases(id) on delete cascade,
  segment_id      uuid references truck_coordination(id) on delete set null,
  document_type   text not null
                    check (document_type in ('delivery_note','return_certificate','truck_photo','signed_policy','other')),
  file_name       text not null,
  storage_provider text not null default 'supabase',
  bucket_name     text not null default 'case-documents',
  object_path     text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     text,
  uploaded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists idx_case_docs_case on case_documents(return_case_id);
create index if not exists idx_case_docs_type on case_documents(document_type);

-- ---------- Action Items / התראות ----------
create table if not exists action_items (
  id              uuid primary key default gen_random_uuid(),
  dedupe_key      text unique,
  return_case_id  text references return_cases(id) on delete cascade,
  type            text not null,
  title           text not null,
  description     text,
  priority        text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  status          text not null default 'open'   check (status in ('open','handled','dismissed')),
  created_by      text,
  due_at          timestamptz,
  handled_at      timestamptz,
  handled_by      text,
  dismissed_at    timestamptz,
  dismissed_by    text,
  metadata        jsonb,
  customer        text,
  project         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_action_items_status on action_items(status);
create index if not exists idx_action_items_case on action_items(return_case_id);

-- ---------- Audit Log ----------
create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  return_case_id  text references return_cases(id) on delete set null,
  action_type     text not null,
  actor_id        text,
  actor_role      text,
  description     text,
  metadata_json   jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_audit_case on audit_logs(return_case_id);
create index if not exists idx_audit_created on audit_logs(created_at desc);

-- ---------- קישורי לקוח חד-פעמיים (לעתיד — Epic 6) ----------
-- חשוב: ייצור הטוקן ואימותו יתבצעו בצד שרת (Edge Function), לא בלקוח בלבד.
create table if not exists customer_tokens (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,
  return_case_id  text references return_cases(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  action_type     text not null,
  status          text not null default 'active' check (status in ('active','used','expired','revoked')),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_customer_tokens_case on customer_tokens(return_case_id);

-- ============================================================
-- RLS — מופעל עם מדיניות פתוחה לפיתוח (anon מלא).
-- TODO: להחליף במדיניות לפי תפקיד (return_coordinator / logistics_manager /
--       plant_manager) אחרי חיבור Supabase Auth. אין להעלות לפרודקשן כך.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'customers','projects','return_cases','truck_coordination',
    'case_documents','action_items','audit_logs','customer_tokens'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists dev_all on %I;', t);
    execute format('create policy dev_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
