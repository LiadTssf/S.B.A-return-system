-- ============================================================
-- Storage — bucket פרטי למסמכי תיקים
-- מריצים אחרי 0001_init.sql
-- ============================================================

-- יצירת bucket פרטי (לא ציבורי) — גישה רק דרך signed URLs
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

-- מדיניות פיתוח: גישה מלאה ל-bucket הזה.
-- TODO: להחליף במדיניות לפי תפקיד + Supabase Auth לפני פרודקשן.
drop policy if exists "dev_case_documents_all" on storage.objects;
create policy "dev_case_documents_all"
  on storage.objects for all
  using (bucket_id = 'case-documents')
  with check (bucket_id = 'case-documents');
