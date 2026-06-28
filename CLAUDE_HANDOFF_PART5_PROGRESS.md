<div dir="rtl">

# CLAUDE_HANDOFF_PART5_PROGRESS — מצב PART 5 (workflow לקוח)

מסמך המשכיות לשיחת Claude Code הבאה. קרא לפני כל פעולה. (ההנחיות ב-`CLAUDE.md` גוברות.)

## 0. מצב Git — קריטי
- ענף `main`. **PART 5 (workflow לקוח + backend ל-intake) קובץ ב-commit יחיד רגיל על גבי `7edef15` ונדחף ל-`origin/main`** (הרץ `git log --oneline -3` ל-hash המדויק). working tree נקי; היחיד הלא-מתועקב הוא `.env.local` (gitignored — creds, לא לחשוף) ו-`node_modules`/`dist`.
- אין לגעת ב-`sba-returns` (אבטיפוס Lovable, reference). מיגרציות אדיטיביות בלבד; **אין לערוך 0001-0010 שהוחלו**. אין לחשוף `.env.local`/סודות/טוקנים. commit/push נוספים — באישור מפורש בלבד.

## 1. מה הוחל ב-Supabase (חי, מאומת)
- **מיגרציות 0007, 0008, 0009, 0010 — כולן הוחלו ואומתו.**
  - `0007_customer_workflow` — `customer_submissions`, עמודות ל-`customer_tokens`, `case_documents.customer_token_id`, `audit_logs.category`, RPCs: `hash_customer_token`/`_create_customer_token`/`validate_customer_token`/`submit_customer_action`/`issue_customer_token`/`revoke_customer_token`/`replace_customer_token`.
  - `0008_submission_review_hardening` — `review_customer_submission` RPC; שלילת UPDATE ישיר ל-`customer_submissions` (SELECT בלבד); ניקוי TRUNCATE/REFERENCES/TRIGGER מ-authenticated.
  - `0009_upload_pending_review` — `submit_customer_action` עודכן: `upload_doc → pending_review` (Level-2), `sign_policy → auto_applied`.
  - `0010_intake_request_approval` — **הוחל דרך SQL editor.** מוסיף `return_cases.contact_name/contact_phone`, `customer_submissions.created_case_id/resolution`, `uq_projects_customer_name` (+preflight), `uq_submission_created_case`, ו-RPC `approve_intake_request(uuid, jsonb)`.
- **אימות סכמה חי לאחר 0010 (עבר):** `return_cases.contact_name`/`contact_phone` קיימים · `customer_submissions.created_case_id`/`resolution` קיימים · `approve_intake_request(uuid,jsonb)` קיים · RPC אנונימי נדחה · ייחוד `(customer_id, name)` נאכף.
- **Edge Function `request-customer-upload` — פרוס** (Dashboard). `verify_jwt=false` (מפתח publishable אינו JWT; הטוקן החד-פעמי הוא ההרשאה). secret `ALLOWED_ORIGINS=http://localhost:5173`. service key מוזרק ע"י הפלטפורמה בלבד.
- אימות חי: `smoke-edge` 16/16 (origin/טוקנים/MIME/גודל/uploadToken צמוד-נתיב/anon-denied).

## 2. מה מומש בקוד (לא-מתועקב)
- **שירותים:** `src/lib/customer-workflow.ts` (מעריך טהור `evaluateWorkflow` + טיפוסי state; כללי sign→schedule→upload; upload מושלם רק ב-approved), `src/lib/customer-workflow-loader.ts` (`getWorkflowState`/`getNextAction`), `src/adapters/supabaseCustomerLinksAdapter.ts` (issue/validate/submit/revoke/replace/review + tokensForCase/submissionsForCase + סיווג שגיאות `CustomerLinkError`), `src/lib/customer-upload.ts` (invoke→uploadToSignedUrl→submit).
- **UI (5C):** `src/routes/c.$token.{schedule,cancel,sign,upload}.tsx` (sign מרכיב PNG נוהל-חתום שלם), `src/components/external-token-guard.tsx`, `customer-submissions-card.tsx` (סקירה דרך `review_customer_submission` + צפייה/הורדה), `customer-link-dialog.tsx` (issue), `whatsapp-simulator.tsx` (לקוח דק; כולל תיקון Issue 2 — כפתורי sign/upload דרך הדף החיצוני), `use-customer-links.ts`, `lakoach.tsx`, `document-types.ts` (+`customerTokenId`), `supabaseDocumentsAdapter.ts`.
- **בדיקות:** `scripts/test-workflow.ts` (20/20), `smoke-auth.mjs`(19), `smoke-0007.mjs`(33), `smoke-0008.mjs`(12), `smoke-5c.ts`(16), `smoke-upload.ts`(21), `smoke-edge.ts`(16 — פונקציה פרוסה), `smoke-crud.mjs`(27), `check-0009.ts`, `verify-0007.sql`, `inspect-0007.sql`, **`smoke-0010.ts` — רץ ועבר 29/29 ✓** (intake: site/contact ברמת תיק, resolution, ייחוד פרויקט, מרוץ מקבילי, בעלות, conflicts, anon-denied, idempotency).
- **אימות אחרון (post-0010):** רגרסיות עברו — `smoke-0007` 33/33 · `smoke-0008` 12/12 · `smoke-crud` 27/27 · `smoke-5c` 16/16 · `test-workflow` 20/20. `tsc --noEmit` נקי · `vite build` נקי (אזהרת chunk-size בלבד). **backend ל-intake מוכן.** PNG נוהל-חתום אומת ויזואלית (RTL, כל הראיות, ללא חיתוך).

## 3. החלטות נעולות (לשמר)
- Supabase = מקור אמת. טוקן מגובב בצד-שרת; raw מוחזר פעם אחת (issue/replace). anon: רק `validate`/`submit` (+ Edge function ציבורי עם אימות-טוקן). issue/revoke/replace/review/approve = עובד פעיל תפעולי (coordinator/logistics/admin); factory_manager קריאה בלבד.
- `upload_doc` = Level-2: `pending_review` → `approved` דרך `review_customer_submission` (לא UPDATE ישיר). `sign_policy` = `auto_applied`.
- signed_policy = PNG מורכב (נוסח נוהל + חותם + תאריך + פרויקט/אתר + הסכמה + חתימה + גרסה + sha256). אין Base64 ב-JSON/localStorage.
- intake = **אישור בשליטת רכז**: הלקוח מגיש בקשה גולמית (`pending_review`, ללא תיק); הרכז מאשר דרך RPC שיוצר את התיק אטומית. `site` ואיש-קשר/טלפון = ברמת התיק (`return_cases.site`/`contact_name`/`contact_phone`). זהות פרויקט = `(customer_id, name)`; `projects.site` legacy/NULL (אינו נקרא בשום מסך).

## 4. ממתין / השלב הבא
- ✅ **בוצע:** `0010` הוחל ואומת; `smoke-0010` 29/29; רגרסיות+typecheck+build נקיים; PART 5 קובץ ב-commit יחיד ונדחף ל-`origin/main`.
1. **לממש UI ל-intake** (טרם מומש — תכנית בלבד; **השלב הבא**): `src/routes/c.$token.intake.tsx` (טופס לקוח חיצוני → `submitAction(intake_request)`); `src/components/pending-intake-card.tsx` (רשימת בקשות חסרות-תיק בדשבורד) + `intake-approval-dialog.tsx` (dropdown לקוח חיפושי+"צור חדש", dropdown פרויקט מסונן-לקוח+"צור חדש", `site` עצמאי חובה, contact_name/phone, אזהרת-שם, סיכום, אשר→`approve_intake_request`→ניווט `/tikim/$caseId`, דחה); מתודות adapter: `pendingIntakeRequests()`/`searchCustomers(q)`/`customerProjects(custId)`/`approveIntake(subId, resolution)`; **חיווט הסימולטור** (טרם בוצע): `IntakeForm` → `issueToken({action:"intake_request"})` (תיק null) + פתיחת `/c/<token>/intake` (במקום `casesAdapter.create`).
2. rate-limiting (edge/WAF) לפני פיילוט ציבורי. בדיקת לוגי Dashboard (אין סודות). בדיקת factory_manager/עובד-לא-פעיל חיה.
3. ניקוי אדמיניסטרטיבי מדויק (אופציונלי) של הגשות-בדיקה חסרות-תיק (ראו §6) — service-role/SQL editor בלבד.

## 5. תצורה/הרצה
- `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable `sb_publishable_`), `SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD` (coordinator פעיל). **לא להדפיס.**
- בדיקות חיות: `node scripts/<smoke>.{mjs,ts}` (Node 24 — type-stripping מובנה ל-.ts). מצב מיגרציה נבדק התנהגותית (ראו `check-0009.ts`).
- preview מקומי: `mcp Claude_Preview` עם `.claude/launch.json` (sba-dev, npm run dev, 5173) — נוצר/נמחק לפי צורך; דפי לקוח חיצוניים ציבוריים, אך **הטוקן ב-URL → לא לנווט לטוקן אמיתי בכלי שמדפיס פרמטרים**.

## 6. מגבלות/פערים ידועים
- **intake UI טרם מומש; חיווט הסימולטור טרם בוצע.** `0010` הוחל ואומת (השלב הבא = UI בלבד).
- **שאריות בדיקה ב-`customer_submissions` (intake_request, חסרות-תיק):** נכון לאימות האחרון — **10 הגשות** (9 `pending_review` + 1 `rejected`), כולן ללא `return_case_id`/`created_case_id`. גדל מ-4: כל ריצת `smoke-0010` מוסיפה הגשות (כל `submitIntake` יוצר שורה; אישור שנכשל/נדחה משאיר אותה `pending_review`). **הקליינט אינו יכול למחוק** (0008: `customer_submissions` = SELECT-only). **אין להרחיב הרשאות מחיקה ואין להחליש 0008 כדי להסירן.** ניקוי מדויק אפשרי דרך service-role/SQL editor בלבד (אדמיניסטרטיבי, לא דחוף). תיקים/לקוחות/פרויקטים של הבדיקה כן נוקו.
- `return_cases` ללא שדה note ייעודי → note של intake נשמר ב-`customer_submissions.resolution` בלבד (MVP).
- `projects.site` legacy: נכתב ע"י `resolveProjectId` (יצירת תיק ישירה) אך **אינו נקרא**; ב-intake נשאר NULL. ניקוי עתידי אפשרי (לא דחוף).
- העלאת קובץ חי (sign/upload) דרך הדפדפן לא הורצה E2E מלא (חסם חשיפת-סיסמה/טוקן); מאומת בשכבת-שירות + פונקציה פרוסה.

</div>
