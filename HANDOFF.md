<div dir="rtl">

# מסמך מסירה (Handoff) — S.B.A Return Management

> ⚠️ **מסמך כללי — נכון ל-Day 2 / PART 4.5.** ל-PART 5 (workflow לקוח + backend ל-intake, מיגרציות 0007–0010) המסמך הסמכותי והעדכני הוא **`CLAUDE_HANDOFF_PART5_PROGRESS.md`**. קרא אותו תחילה לכל עבודת PART 5+.

עודכן בסיום Day 2 (Parts 1–4.5 — כולל Auth + RLS פנימי). מיועד למפתחים שימשיכו את הפרויקט.

## תמונת מצב כללית
- **סטאק:** React 19 + Vite + TanStack Router (SPA) + Tailwind + shadcn, עברית RTL.
- **Backend:** Supabase (PostgreSQL + Storage).
- **בחירת מקור נתונים אוטומטית** (`src/adapters/index.ts`): אם קיימים `VITE_SUPABASE_URL`+`VITE_SUPABASE_ANON_KEY` ב-`.env.local` → Supabase; אחרת → mock (localStorage). כל ה-UI ניגש דרך `@/adapters` בלבד, לעולם לא ל-localStorage ישירות.

## ✅ מחובר ל-Supabase (אמיתי, מאומת מול ה-DB)
| תחום | טבלה / מנגנון |
|---|---|
| תיקי החזרה | `return_cases` (+ `customers`, `projects`) |
| תיאום משאיות + לוח שנה | `truck_coordination` |
| Action items / התראות | `action_items` |
| Audit log | `audit_logs` |
| מסמכים ותמונות | `case_documents` + Storage bucket `case-documents` (signed URL) |
| חיפוש מתקדם | שאילתות על נתוני אמת בלבד |
| חסימת סגירת משאית | לפי `case_documents` אמיתיים (תעודה + תמונת משאית) |

אומת ע"י `scripts/smoke-auth.mjs` (מאומת — 19/19 מול ה-DB החי). **שים לב:** סקריפטי ה-anon הישנים נדחים אחרי `0006` — ראו סעיף אבטחה.

## ⚗️ עדיין אבטיפוס / סימולציה (mock — מסומן בבירור ב-UI)
| מודול | מצב | סימון ב-UI |
|---|---|---|
| ממשק לקוח / WhatsApp (`/lakoach`) | סימולציה. **יצירת/עדכון תיק אמיתיים ב-Supabase**, אך הודעות/קישורים/חתימות/בקשות אינם ב-Supabase | באנר "סימולציה בלבד" |
| דפי לקוח חיצוני (`/c/$token/*`) | אבטיפוס — אימות טוקן לא מחובר ל-Supabase | `PrototypeNotice` |
| בקשות לקוח (בכרטיס התיק) | mock — ריק במצב Supabase | `PrototypeNotice` |
| תקשורת לקוח / הודעות | סימולציה — אין שליחה אמיתית | `PrototypeNotice` |
| תזכורות | מקומי בדפדפן בלבד | `PrototypeNotice` |

(התחברות/תפקידים/RLS — **כבר אמיתי** מ-PART 4.5; ראו סעיף אבטחה למטה.)

**עיקרון:** אף מודול mock אינו מציג רשומות תפעוליות מזויפות כאמיתיות — במצב Supabase הקריאות מוחזרות ריקות ומסומנות כאבטיפוס.

## 🔐 אבטחה — Auth + RLS (מומש ב-PART 4.5, MVP)
- **Supabase Auth** לעובדים: דף התחברות, session מתמשך, יציאה, ראוטים פנימיים מוגנים, חסימת משתמש לא-פעיל. הדפדפן משתמש ב-publishable key בלבד.
- **טבלת `profiles`** (מקושרת ל-`auth.users`): `role` ∈ {coordinator, logistics, factory_manager, admin} + `is_active`. trigger יוצר פרופיל **לא-פעיל** לכל משתמש חדש; הפעלה ידנית ע"י admin (Dashboard + SQL).
- **מקור התפקיד = הפרופיל המאומת** (בורר הפיתוח הוסר). מטריצת הרשאות מרכזית: `src/lib/permissions.ts`.
- **RLS (`0006_rls.sql`)**: הוסר `dev_all`. טבלאות תפעוליות: SELECT=עובד פעיל · INSERT/UPDATE/DELETE=coordinator/logistics/admin. `factory_manager`=קריאה בלבד. `audit_logs`=immutable (ללא UPDATE/DELETE). **anon ללא גישה ישירה**. Storage `case-documents` מאובטח לעובדים פעילים. `audit.actor_id`=ה-uuid המאומת.

### בדיקות אבטחה (מאומת מול ה-DB)
- **`scripts/smoke-auth.mjs` — הבדיקה הקנונית** אחרי RLS (מתחבר עם `SMOKE_TEST_EMAIL/PASSWORD` מ-`.env.local`). 19/19: חיוב coordinator · שלילת anon · Storage · audit-immutable.
- **`scripts/smoke-inactive.mjs`** — משתמש לא-פעיל: 5/5 (התחברות מצליחה אך גישה נדחית).
- **סקריפטי anon ישנים (`smoke-supabase/search/docs`) צפויים להיכשל אחרי `0006`** (anon נחסם, מתוכנן). מ-pre-RLS — להריץ מול mock/dev או לעדכן לאימות.

### פתוח / ידוע
- **בדיקת `factory_manager` read-only חיה — עדיין pending** (לא נוצר משתמש כזה; אומת לוגית: התפקיד אינו ב-OPERATIONAL → כתיבה נדחית, קריאה מותרת).
- **התפשטות שינוי הרשאה** (`is_active`/role): מתפשטת תוך שניות (cache PostgREST על פונקציות STABLE) — לא מיידי, מתכנס. אינו חור אבטחה.
- **עקביות מחיקת מסמך↔Storage**: `documentsAdapter.remove`/`removeForSegment` מוחקים את אובייקט ה-Storage ואז את שורת ה-metadata, אך תוצאת `storage.remove()` אינה נבדקת → כשל ב-Storage עלול להשאיר אובייקט יתום (עלות בלבד, לא נראה למשתמש). אין מחיקת תיק קשיחה. המלצה עתידית: מעבר ל-archive/cancel.

## מסכים בטוחים להדגמה תפעולית (מול Supabase)
דשבורד · תיקי החזרה · תיק מפורט (ליבה + מסמכים + תיאום + audit) · לוח שנה (תיאום) · התראות/action items · חיפוש מתקדם · יומן פעולות.

## מסכים שהם placeholder מכוון (לא להדגים כתפעולי)
`/lakoach` (סימולציית WhatsApp) · `/c/$token/*` (דפי לקוח). נשמרים בכוונה כשכבת המחשת-תהליך עד למימוש האמיתי.

## ⚠️ חובה לפני פיילוט אמיתי במפעל
1. ✅ **Auth** — מומש (MVP, PART 4.5). חסר: ניהול משתמשים ב-UI (כרגע Dashboard/SQL), MFA/איפוס סיסמה.
2. ✅ **RLS** — מומש (MVP, PART 4.5). חסר: בדיקת `factory_manager` חיה, חידוד תפקידים לפי דרישות עתידיות.
3. **טוקני לקוח** — עדיין mock. יוקם ב-PART 5: `customer_submissions` + token lifecycle אמיתי + RPC צד-שרת (issue/revoke מאומת; validate/submit ל-anon). אסור לייצר טוקנים בצד לקוח בלבד.
4. **WhatsApp אמיתי** — ספק Business API (Epic 6). הסימולטור יהפוך ללקוח דק מעל שירותי workflow משותפים.
5. **תזכורות/הודעות** — עדיין mock; להעביר ל-Supabase (+ נגזרת action items מתוזמנת).
6. **Penetration test** + גיבויים.
7. תיקון `VITE_SUPABASE_URL` ב-`.env.local` לכתובת הבסיסית (יש נרמול אוטומטי, אך עדיף נקי).

## אינטגרציות שיחליפו סימולציה בעתיד
- **WhatsApp Business API** יחליף את הסימולטור — שכבת ה-workflow ב-Supabase (תיקים/סטטוסים) נשמרת; רק ה-UI של הסימולטור יוחלף.
- **Outlook** (סנכרון יומן) — עתידי, לא מומש.
- **ERP** — עתידי; כרגע העלאה ידנית.

## הרצה מקומית
```
cd "main project"
npm install
npm run dev            # http://localhost:5173
```
`.env.local` (לא ב-git):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```
Migrations (SQL Editor, לפי הסדר): `supabase/migrations/0001` → `0006`.
בדיקות עשן מאומתות: `node scripts/smoke-auth.mjs` (+ `smoke-inactive.mjs` כשפרופיל הבדיקה מושבת). סקריפטי anon ישנים (`smoke-supabase/search/docs`) הם pre-RLS ונדחים אחרי `0006`.
יצירת עובד ראשון: ראו `supabase/README.md`.

## מבנה שכבת הנתונים (להמשך מימוש)
- `src/adapters/mock*Adapter.ts` — מימוש mock (localStorage).
- `src/adapters/supabase*Adapter.ts` — מימוש Supabase.
- `src/adapters/index.ts` — בורר אוטומטי. **כדי לחבר מודול mock נוסף ל-Supabase:** כתוב `supabaseXAdapter` באותו ממשק, והחלף ב-`index.ts`.
- מודולים שטרם הוגרו: `notifications`, `customer-links`, `reminders`, `search`(mock fallback).

*אין לגעת בתיקיית `sba-returns` — היא אבטיפוס ה-Lovable המקורי (reference בלבד).*

</div>
