<div dir="rtl">

# הקמת Supabase — S.B.A. Return Management

## שלבים

1. **צור פרויקט Supabase** ב-https://supabase.com (בחר אזור קרוב, למשל Frankfurt).

2. **קח את המפתחות** מ-Project Settings → API:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`

3. **צור קובץ `.env.local`** בשורש `main project` (העתק מ-`.env.local.example`) ומלא את הערכים:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   הקובץ ב-gitignore — לא נכנס ל-git.

4. **הרץ את ה-migrations** — דרך SQL Editor ב-Supabase (העתק-הדבק את תוכן הקבצים לפי הסדר):
   - `migrations/0001_init.sql` — טבלאות הליבה
   - `migrations/0002_storage.sql` — bucket למסמכים

5. **הפעל מחדש את `npm run dev`** — כשהמשתנים מוגדרים, האפליקציה תעבור אוטומטית ל-Supabase adapters. בלי הגדרה היא ממשיכה לרוץ על mock (localStorage).

## הערות חשובות

- **RLS**: כרגע מדיניות פתוחה לפיתוח בלבד (`dev_all`). לפני פרודקשן יש להחליף במדיניות לפי תפקיד + Supabase Auth.
- **טוקני לקוח**: טבלת `customer_tokens` מוכנה, אבל ייצור/אימות טוקן חייב לרוץ בצד שרת (Edge Function) — לא בלקוח בלבד.
- **אחסון קבצים**: bucket `case-documents` פרטי. צפייה/הורדה דרך signed URL בלבד.

</div>
