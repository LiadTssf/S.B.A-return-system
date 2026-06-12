-- ============================================================
-- הרשאות גישה (GRANTS) — נדרש כדי שה-REST API (תפקיד anon/authenticated)
-- יוכל לגשת לטבלאות. בלי זה מתקבל "permission denied for table".
-- מריצים פעם אחת אחרי 0001_init.sql.
-- בטוח להריץ שוב (idempotent).
-- TODO: לאחר הוספת Auth + RLS לפי תפקיד, אפשר לצמצם הרשאות אלו.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public
  to anon, authenticated, service_role;

grant all privileges on all sequences in schema public
  to anon, authenticated, service_role;

-- ברירת מחדל לטבלאות/רצפים עתידיים בסכימה public
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
