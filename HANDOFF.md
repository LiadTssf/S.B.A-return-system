<div dir="rtl">

# מסמך מסירה (Handoff) — S.B.A Return Management

עודכן בסיום Day 2 (Parts 1–4). מיועד למפתחים שימשיכו את הפרויקט.

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

אומת ע"י: `smoke-supabase.mjs`, `smoke-search.mjs`, `smoke-docs.mjs` (כולם עברו מול ה-DB החי).

## ⚗️ עדיין אבטיפוס / סימולציה (mock — מסומן בבירור ב-UI)
| מודול | מצב | סימון ב-UI |
|---|---|---|
| ממשק לקוח / WhatsApp (`/lakoach`) | סימולציה. **יצירת/עדכון תיק אמיתיים ב-Supabase**, אך הודעות/קישורים/חתימות/בקשות אינם ב-Supabase | באנר "סימולציה בלבד" |
| דפי לקוח חיצוני (`/c/$token/*`) | אבטיפוס — אימות טוקן לא מחובר ל-Supabase | `PrototypeNotice` |
| בקשות לקוח (בכרטיס התיק) | mock — ריק במצב Supabase | `PrototypeNotice` |
| תקשורת לקוח / הודעות | סימולציה — אין שליחה אמיתית | `PrototypeNotice` |
| תזכורות | מקומי בדפדפן בלבד | `PrototypeNotice` |
| תפקידים/הרשאות | בורר "מצב פיתוח"; RLS פתוח (`dev_all`) | תווית "מצב פיתוח" |

**עיקרון:** אף מודול mock אינו מציג רשומות תפעוליות מזויפות כאמיתיות — במצב Supabase הקריאות מוחזרות ריקות ומסומנות כאבטיפוס.

## מסכים בטוחים להדגמה תפעולית (מול Supabase)
דשבורד · תיקי החזרה · תיק מפורט (ליבה + מסמכים + תיאום + audit) · לוח שנה (תיאום) · התראות/action items · חיפוש מתקדם · יומן פעולות.

## מסכים שהם placeholder מכוון (לא להדגים כתפעולי)
`/lakoach` (סימולציית WhatsApp) · `/c/$token/*` (דפי לקוח). נשמרים בכוונה כשכבת המחשת-תהליך עד למימוש האמיתי.

## ⚠️ חובה לפני פיילוט אמיתי במפעל
1. **Auth אמיתי** — Supabase Auth + טבלת `users` + תפקידים; להסיר את בורר התפקידים.
2. **RLS לפי תפקיד** — להחליף את מדיניות `dev_all` (כרגע פתוחה לחלוטין) במדיניות הרשאות אמיתית.
3. **טוקני לקוח** — טבלת `customer_tokens` + יצירה/אימות בצד שרת (Edge Function); אסור לייצר טוקנים בצד לקוח בלבד.
4. **WhatsApp אמיתי** — ספק Business API (Epic 6).
5. **תזכורות/הודעות** — להעביר ל-Supabase (+ נגזרת action items מתוזמנת).
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
Migrations (SQL Editor, לפי הסדר): `supabase/migrations/0001` → `0004`.
בדיקות עשן מול ה-DB: `node scripts/smoke-supabase.mjs` · `smoke-search.mjs` · `smoke-docs.mjs`.

## מבנה שכבת הנתונים (להמשך מימוש)
- `src/adapters/mock*Adapter.ts` — מימוש mock (localStorage).
- `src/adapters/supabase*Adapter.ts` — מימוש Supabase.
- `src/adapters/index.ts` — בורר אוטומטי. **כדי לחבר מודול mock נוסף ל-Supabase:** כתוב `supabaseXAdapter` באותו ממשק, והחלף ב-`index.ts`.
- מודולים שטרם הוגרו: `notifications`, `customer-links`, `reminders`, `search`(mock fallback).

*אין לגעת בתיקיית `sba-returns` — היא אבטיפוס ה-Lovable המקורי (reference בלבד).*

</div>
