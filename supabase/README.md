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
   - `migrations/0003_grants.sql` — הרשאות גישה ל-anon (חובה! בלי זה: "permission denied for table")
   - `migrations/0004_case_documents_title.sql` — עמודת כותרת תצוגה למסמכים
   - `migrations/0005_auth_profiles.sql` — טבלת `profiles` + פונקציות Auth (PART 4.5)
   - `migrations/0006_rls.sql` — RLS לפי תפקיד (מסיר `dev_all`, חוסם anon). **הרץ רק אחרי שהעובד הראשון מתחבר** (אחרת תינעל מחוץ לנתונים).

5. **הפעל מחדש את `npm run dev`** — כשהמשתנים מוגדרים, האפליקציה תעבור אוטומטית ל-Supabase adapters. בלי הגדרה היא ממשיכה לרוץ על mock (localStorage).

6. **צור עובד ראשון (admin)** — לאחר `0005`:
   - Dashboard → Authentication → Users → **Add user** (סמן **Auto Confirm User**).
   - ה-trigger יוצר פרופיל לא-פעיל. הפעל כ-admin ב-SQL Editor:
     ```sql
     update public.profiles
     set role = 'admin', is_active = true, display_name = 'מנהל מערכת'
     where user_id = (select id from auth.users where email = 'האימייל-שלך');
     ```
   - התחבר בדף הכניסה של האפליקציה.
   - **לבדיקות smoke מאומתות:** צור עובד נוסף ייעודי, הפעל אותו, והכנס את פרטיו ל-`.env.local` כ-`SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD`.

## הערות חשובות

- **RLS**: מופעל לפי תפקיד (`0006`) — עובד פעיל קורא; coordinator/logistics/admin כותבים; factory_manager קריאה בלבד; `audit_logs` immutable; anon חסום מהטבלאות. ניהול משתמשים כרגע דרך Dashboard/SQL.
- **טוקני לקוח**: טבלת `customer_tokens` מוכנה, אבל ייצור/אימות טוקן חייב לרוץ בצד שרת (Edge Function) — לא בלקוח בלבד.
- **אחסון קבצים**: bucket `case-documents` פרטי. צפייה/הורדה דרך signed URL בלבד.

</div>
