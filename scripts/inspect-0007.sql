-- ============================================================
-- inspect-0007.sql — אימות קטלוג לקריאה-בלבד (SELECT בלבד). להריץ ב-SQL editor.
-- מאשר קיום אינדקסים/policies/grants/constraints/פונקציות כפי שתוכננו ב-0007.
-- (הלקוח/PostgREST אינו חושף את pg_catalog, לכן אימות זה נעשה ב-SQL editor.)
-- ============================================================

-- (1) עמודות חדשות
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'customer_tokens'      and column_name in ('segment_id','document_type','issued_by','revoked_at','revoked_by','replaced_by'))
     or (table_name = 'case_documents'       and column_name = 'customer_token_id')
     or (table_name = 'audit_logs'           and column_name = 'category'))
 order by table_name, column_name;

-- (2) טבלה חדשה + עמודותיה
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'customer_submissions'
 order by ordinal_position;

-- (3) אינדקסים (כולל החלקיים) — בדוק את predicate ה-WHERE
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname in (
     'uq_customer_submissions_token','idx_customer_submissions_case','idx_customer_submissions_status',
     'uq_case_docs_token_doctype','idx_customer_tokens_status','idx_audit_category',
     'uq_active_token_case_action','uq_active_token_segment_action')
 order by indexname;

-- (4) Constraints (checks + FKs חדשים)
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conname in (
   'customer_tokens_action_type_chk','customer_tokens_document_type_chk','audit_logs_category_chk')
 order by conname;

-- (5) RLS policies על customer_submissions
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'customer_submissions'
 order by policyname;

-- (6) הרשאות הפעלה על הפונקציות (grantee לכל RPC)
select routine_name, grantee, privilege_type
  from information_schema.role_routine_grants
 where specific_schema = 'public'
   and routine_name in (
     'hash_customer_token','_create_customer_token','validate_customer_token',
     'submit_customer_action','issue_customer_token','revoke_customer_token','replace_customer_token')
 order by routine_name, grantee;

-- (7) מאפייני אבטחה של הפונקציות (SECURITY DEFINER + search_path קבוע)
select p.proname,
       p.prosecdef        as security_definer,
       p.proconfig        as settings  -- אמור לכלול search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'hash_customer_token','_create_customer_token','validate_customer_token',
     'submit_customer_action','issue_customer_token','revoke_customer_token','replace_customer_token')
 order by p.proname;

-- (8) הרשאות ישירות על הטבלאות הרגישות (ודא ש-anon אינו מופיע)
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('customer_tokens','customer_submissions')
   and grantee in ('anon','authenticated')
 order by table_name, grantee, privilege_type;
