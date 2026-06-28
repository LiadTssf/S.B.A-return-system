// בדיקות יחידה למעריך ה-workflow הטהור (ללא Supabase). הרצה: node scripts/test-workflow.ts
// (Node 23+ עושה type-stripping מובנה; הייבוא של customer-workflow.ts הוא type-only ולכן נמחק בריצה.)
import {
  evaluateWorkflow,
  type SubmissionStatus,
  type TokenStatus,
  type WorkflowFacts,
} from "../src/lib/customer-workflow.ts";

const NOW = 1_000_000_000_000;
const FUTURE = NOW + 3_600_000; // טוקן בתוקף
const PAST = NOW - 3_600_000; // טוקן שפג

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log("  ✓", name); pass++; }
  else { console.log("  ✗", name, detail ? "— " + detail : ""); fail++; }
}
function facts(p: Partial<WorkflowFacts>): WorkflowFacts {
  return {
    caseId: "CASE", caseStatus: "open", tokens: [], submissions: [],
    documentTypes: [], confirmedSchedule: false, nowMs: NOW, ...p,
  };
}
const tok = (action: any, status: TokenStatus, expiresAtMs: number, documentType?: any) =>
  ({ action, status, expiresAtMs, documentType });
const sub = (action: any, status: SubmissionStatus, submittedAtMs = NOW) =>
  ({ action, status, submittedAtMs });

// 1) הנוהל לא נחתם
{
  const s = evaluateWorkflow(facts({}));
  check("1 policy not signed → sign not_started, next=sign_policy/needs_issue",
    s.steps.sign.state === "not_started" && s.currentStep === "sign" &&
    s.nextAction === "sign_policy" && s.nextReason === "needs_issue" && !s.isComplete,
    JSON.stringify(s));
}

// 2) טוקן חתימה פעיל — ממתין ללקוח
{
  const s = evaluateWorkflow(facts({ tokens: [tok("sign_policy", "active", FUTURE)] }));
  check("2 active sign token → awaiting_customer",
    s.steps.sign.state === "awaiting_customer" && s.nextAction === "sign_policy" &&
    s.nextReason === "awaiting_customer", JSON.stringify(s));
}

// 3) הגשת חתימה ממתינה לסקירה — חוסם פעולה הבאה
{
  const s = evaluateWorkflow(facts({ submissions: [sub("sign_policy", "pending_review")] }));
  check("3 sign pending_review → blocked, no next action",
    s.steps.sign.state === "pending_review" && s.nextAction === null &&
    s.blockedOnReview && s.nextReason === "blocked_on_review", JSON.stringify(s));
}

// 4) נוהל חתום הושלם (מסמך signed_policy אמיתי) → מתקדם ל-schedule
{
  const s = evaluateWorkflow(facts({ documentTypes: ["signed_policy"] }));
  check("4 signed via real doc → sign done, current=schedule",
    s.steps.sign.state === "done" && s.currentStep === "schedule" &&
    s.nextAction === "schedule", JSON.stringify(s));
  // נתיב חלופי: הגשת sign_policy=auto_applied
  const s2 = evaluateWorkflow(facts({ submissions: [sub("sign_policy", "auto_applied")] }));
  check("4b signed via auto_applied submission → sign done", s2.steps.sign.state === "done");
}

// 5) תיאום ממתין לסקירה
{
  const s = evaluateWorkflow(facts({
    documentTypes: ["signed_policy"],
    submissions: [sub("schedule", "pending_review")],
  }));
  check("5 schedule pending_review → blocked, no next action",
    s.steps.schedule.state === "pending_review" && s.currentStep === "schedule" &&
    s.nextAction === null && s.blockedOnReview, JSON.stringify(s));
}

// 6) תיאום הושלם (segment מאומת) → מתקדם ל-upload
{
  const s = evaluateWorkflow(facts({ documentTypes: ["signed_policy"], confirmedSchedule: true }));
  check("6 schedule done via confirmed segment → current=upload, next=upload_doc",
    s.steps.schedule.state === "done" && s.currentStep === "upload" &&
    s.nextAction === "upload_doc", JSON.stringify(s));
  // נתיב חלופי: הגשת schedule=approved
  const s2 = evaluateWorkflow(facts({ documentTypes: ["signed_policy"], submissions: [sub("schedule", "approved")] }));
  check("6b schedule done via approved submission", s2.steps.schedule.state === "done");
}

// 7) העלאת מסמך ממתינה לסקירה
{
  const s = evaluateWorkflow(facts({
    documentTypes: ["signed_policy"], confirmedSchedule: true,
    submissions: [sub("upload_doc", "pending_review")],
  }));
  check("7 upload pending_review → blocked, no next action",
    s.steps.upload.state === "pending_review" && s.nextAction === null && s.blockedOnReview,
    JSON.stringify(s));
}

// 8) upload_doc approved (אישור עובד Level-2) → upload done, הושלם
{
  const done = evaluateWorkflow(facts({
    documentTypes: ["signed_policy", "delivery_note"], confirmedSchedule: true,
    tokens: [tok("upload_doc", "used", PAST, "delivery_note")],
    submissions: [sub("upload_doc", "approved")],
  }));
  check("8 upload_doc approved → upload done, complete, no next action",
    done.steps.upload.state === "done" && done.currentStep === null &&
    done.isComplete && done.nextAction === null && done.nextReason === "complete",
    JSON.stringify(done));

  // 8b) מסמך הועלה אך טרם אושר → upload לא הושלם (Level-2), חוסם
  const uploaded = evaluateWorkflow(facts({
    documentTypes: ["signed_policy", "delivery_note"], confirmedSchedule: true,
    tokens: [tok("upload_doc", "used", PAST, "delivery_note")],
    submissions: [sub("upload_doc", "auto_applied")],
  }));
  check("8b uploaded but not approved → upload pending_review (NOT done), blocked",
    uploaded.steps.upload.state === "pending_review" && uploaded.nextAction === null && uploaded.blockedOnReview,
    JSON.stringify(uploaded));

  // 8c) מסמכים קיימים ללא הגשת upload_doc → לעולם לא משלים את שלב ה-upload
  const arbitrary = evaluateWorkflow(facts({
    documentTypes: ["signed_policy", "truck_photo", "delivery_note", "return_certificate"],
    confirmedSchedule: true,
  }));
  check("8c documents exist but no upload_doc submission → upload not_started (never auto-complete)",
    arbitrary.steps.upload.state === "not_started" && arbitrary.nextAction === "upload_doc",
    JSON.stringify(arbitrary));

  // 8d) upload_doc נדחה → rejected + דרישת קישור/העלאה חדשים
  const rej = evaluateWorkflow(facts({
    documentTypes: ["signed_policy"], confirmedSchedule: true,
    submissions: [sub("upload_doc", "rejected")],
  }));
  check("8d upload_doc rejected → upload rejected, next=upload_doc/needs_reissue",
    rej.steps.upload.state === "rejected" && rej.nextAction === "upload_doc" && rej.nextReason === "needs_reissue",
    JSON.stringify(rej));
}

// 9) הגשה שנדחתה → דרושה הנפקה מחדש
{
  const s = evaluateWorkflow(facts({
    documentTypes: ["signed_policy"], submissions: [sub("schedule", "rejected")],
  }));
  check("9 rejected schedule submission → schedule rejected, next=schedule/needs_reissue",
    s.steps.schedule.state === "rejected" && s.nextAction === "schedule" &&
    s.nextReason === "needs_reissue", JSON.stringify(s));
}

// 10) טוקן שפג/בוטל אינו נחשב "ממתין ללקוח"
{
  const expired = evaluateWorkflow(facts({ tokens: [tok("sign_policy", "active", PAST)] }));
  check("10 time-expired active token → NOT awaiting (not_started)",
    expired.steps.sign.state === "not_started" && expired.nextReason === "needs_issue",
    JSON.stringify(expired));
  const revoked = evaluateWorkflow(facts({ tokens: [tok("sign_policy", "revoked", FUTURE)] }));
  check("10b revoked token → NOT awaiting", revoked.steps.sign.state !== "awaiting_customer");
  const used = evaluateWorkflow(facts({ tokens: [tok("sign_policy", "used", FUTURE)] }));
  check("10c used token → NOT awaiting", used.steps.sign.state !== "awaiting_customer");
}

// 11) בקשת ביטול = ענף אופציונלי (לעולם לא הפעולה הבאה החובה)
{
  const branch = evaluateWorkflow(facts({ submissions: [sub("cancel_request", "pending_review")] }));
  check("11 cancel pending is optional branch → next still sign_policy (not cancel)",
    branch.cancel === "pending_review" && branch.nextAction === "sign_policy",
    JSON.stringify(branch));
  const approved = evaluateWorkflow(facts({ submissions: [sub("cancel_request", "approved")] }));
  check("11b cancel approved → isCancelled, no next action",
    approved.isCancelled && approved.nextAction === null && approved.nextReason === "cancelled",
    JSON.stringify(approved));
}

// 12) workflow מושלם (sign done + schedule done + upload approved) → אין פעולה הבאה
{
  const s = evaluateWorkflow(facts({
    documentTypes: ["signed_policy", "delivery_note"], confirmedSchedule: true,
    tokens: [tok("upload_doc", "used", PAST, "delivery_note")],
    submissions: [sub("upload_doc", "approved")],
  }));
  check("12 completed workflow → isComplete, currentStep null, no next action",
    s.isComplete && s.currentStep === null && s.nextAction === null && s.nextReason === "complete",
    JSON.stringify(s));
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);
