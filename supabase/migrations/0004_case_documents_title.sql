-- ============================================================
-- הוספת כותרת תצוגה ידידותית למסמכים.
-- מריצים אחרי 0001-0003. אין לערוך migrations קודמים.
-- בטוח להריץ שוב (idempotent).
--
-- file_name = שם הקובץ המקורי שהועלה
-- title     = שם תצוגה ידידותי (אופציונלי). אם ריק/NULL — מציגים את file_name.
-- ============================================================

alter table case_documents
  add column if not exists title text;

-- הרשאות לעמודה החדשה כבר מכוסות ע"י ה-GRANT הכללי ב-0003 (grant all on all tables),
-- אך מריצים שוב ליתר ביטחון עבור רשומות/עמודות חדשות.
grant all privileges on table case_documents to anon, authenticated, service_role;
