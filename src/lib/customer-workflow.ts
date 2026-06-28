// ============================================================
// שירות workflow לקוח — מעריך טהור (ללא תלות ב-Supabase).
// מקור האמת: רשומות אמיתיות בלבד (tokens / submissions / case_documents /
// truck_coordination). אין כאן I/O — רק חישוב מצב מ-WorkflowFacts מנורמלות.
//
// ── טבלת החלטות (מנתוני אמת, לא מסדר הסימולטור) ──
// מצב טוקן אפקטיבי: "active" רק אם status='active' AND expiresAtMs>nowMs.
//   טוקן active שפג-זמן / used / revoked / expired ⇒ אינו "ממתין ללקוח".
//
// רצף מחייב: sign → schedule → upload (החלטה עסקית; cancel ו-intake אינם ברצף).
//
//  שלב     | done                                              | pending_review        | awaiting_customer        | rejected                  | not_started
//  --------|---------------------------------------------------|-----------------------|--------------------------|---------------------------|------------
//  sign    | מסמך signed_policy אמיתי או הגשת sign_policy=auto  | sign_policy pending   | טוקן sign_policy active  | הגשה אחרונה rejected      | אחרת
//  schedule| הגשת schedule=approved או segment עם               | schedule pending      | טוקן schedule active     | אחרונה rejected           | אחרת
//          | plannedDate && customerConfirmed                  |                       |                          |                           |
//  upload  | הגשת upload_doc=approved בלבד (אישור עובד Level-2) | upload_doc pending/   | טוקן upload_doc active   | אחרונה rejected           | אחרת
//          | — לא די שמסמך הועלה/קיים                           | auto_applied          |                          |                           |
//
//  cancel (ענף אופציונלי, לא ברצף): approved (הגשה approved או case=cancelled) /
//          pending_review / awaiting_customer (טוקן active) / rejected / none.
//  intake (הקשר אופציונלי): מוחזר רק אם קיימת הגשת intake_request.
//
// nextAction: cancelled/הושלם → null; current ב-pending_review → null (חסום בסקירה);
//             not_started/awaiting_customer/rejected → פעולת השלב. cancel לעולם לא nextAction.
// ============================================================

import type { CustomerActionType } from "./customer-link-types";
import type { CaseStatus } from "./case-types";
import type { DocumentCategory } from "./document-types";

export type StepKey = "sign" | "schedule" | "upload";
export type StepState =
  | "not_started"
  | "awaiting_customer"
  | "pending_review"
  | "done"
  | "rejected";
export type CancelState =
  | "none"
  | "awaiting_customer"
  | "pending_review"
  | "approved"
  | "rejected";
export type IntakeState = "pending_review" | "approved" | "rejected";
export type NextReason =
  | "complete"
  | "cancelled"
  | "blocked_on_review"
  | "awaiting_customer"
  | "needs_issue"
  | "needs_reissue";

export type TokenStatus = "active" | "used" | "expired" | "revoked";
export type SubmissionStatus =
  | "pending_review"
  | "auto_applied"
  | "approved"
  | "rejected";

export interface StepInfo {
  key: StepKey;
  state: StepState;
  requiredDocumentType?: DocumentCategory;
}

export interface WorkflowState {
  caseId: string;
  caseStatus: CaseStatus;
  steps: Record<StepKey, StepInfo>;
  cancel: CancelState;
  intake?: IntakeState;
  currentStep: StepKey | null;
  nextAction: CustomerActionType | null;
  nextReason: NextReason;
  blockedOnReview: boolean;
  isComplete: boolean;
  isCancelled: boolean;
}

// ── עובדות מנורמלות (אגנוסטי-למקור; הזרקת nowMs לבדיקה דטרמיניסטית) ──
export interface TokenFact {
  action: CustomerActionType;
  status: TokenStatus;
  expiresAtMs: number;
  documentType?: DocumentCategory | null;
}
export interface SubmissionFact {
  action: CustomerActionType;
  status: SubmissionStatus;
  submittedAtMs: number;
}
export interface WorkflowFacts {
  caseId: string;
  caseStatus: CaseStatus;
  tokens: TokenFact[];
  submissions: SubmissionFact[];
  documentTypes: DocumentCategory[];
  confirmedSchedule: boolean;
  nowMs: number;
}

const SEQUENCE: StepKey[] = ["sign", "schedule", "upload"];
const STEP_ACTION: Record<StepKey, CustomerActionType> = {
  sign: "sign_policy",
  schedule: "schedule",
  upload: "upload_doc",
};

function hasActiveToken(f: WorkflowFacts, action: CustomerActionType): boolean {
  return f.tokens.some(
    (t) => t.action === action && t.status === "active" && t.expiresAtMs > f.nowMs,
  );
}
function hasSubmission(
  f: WorkflowFacts,
  action: CustomerActionType,
  status: SubmissionStatus,
): boolean {
  return f.submissions.some((s) => s.action === action && s.status === status);
}
function latestStatus(
  f: WorkflowFacts,
  action: CustomerActionType,
): SubmissionStatus | null {
  const subs = f.submissions
    .filter((s) => s.action === action)
    .sort((a, b) => b.submittedAtMs - a.submittedAtMs);
  return subs.length ? subs[0].status : null;
}
/** סוג המסמך הנדרש להעלאה — נגזר מטוקן upload_doc העדכני ביותר (אם קיים). */
function uploadRequiredType(f: WorkflowFacts): DocumentCategory | undefined {
  const up = f.tokens
    .filter((t) => t.action === "upload_doc" && t.documentType)
    .sort((a, b) => b.expiresAtMs - a.expiresAtMs);
  return up.length ? (up[0].documentType ?? undefined) : undefined;
}

function evalSign(f: WorkflowFacts): StepState {
  if (f.documentTypes.includes("signed_policy") || hasSubmission(f, "sign_policy", "auto_applied"))
    return "done";
  if (hasSubmission(f, "sign_policy", "pending_review")) return "pending_review";
  if (hasActiveToken(f, "sign_policy")) return "awaiting_customer";
  if (latestStatus(f, "sign_policy") === "rejected") return "rejected";
  return "not_started";
}
function evalSchedule(f: WorkflowFacts): StepState {
  if (hasSubmission(f, "schedule", "approved") || f.confirmedSchedule) return "done";
  if (hasSubmission(f, "schedule", "pending_review")) return "pending_review";
  if (hasActiveToken(f, "schedule")) return "awaiting_customer";
  if (latestStatus(f, "schedule") === "rejected") return "rejected";
  return "not_started";
}
function evalUpload(f: WorkflowFacts): StepState {
  // Level-2: השלב מושלם רק לאחר אישור עובד של הגשת upload_doc — לא די בכך
  // שמסמך הועלה/קיים (קובץ תקין טכנית אינו מוכיח תוכן תפעולי נכון).
  if (hasSubmission(f, "upload_doc", "approved")) return "done";
  // הגשה ממתינה (או auto_applied ישן) → ממתין לסקירה (חוסם), אינו מושלם.
  if (hasSubmission(f, "upload_doc", "pending_review") || hasSubmission(f, "upload_doc", "auto_applied"))
    return "pending_review";
  if (hasActiveToken(f, "upload_doc")) return "awaiting_customer";
  if (latestStatus(f, "upload_doc") === "rejected") return "rejected";
  return "not_started";
}
function evalCancel(f: WorkflowFacts): CancelState {
  if (hasSubmission(f, "cancel_request", "approved") || f.caseStatus === "cancelled")
    return "approved";
  if (hasSubmission(f, "cancel_request", "pending_review")) return "pending_review";
  if (hasActiveToken(f, "cancel_request")) return "awaiting_customer";
  if (latestStatus(f, "cancel_request") === "rejected") return "rejected";
  return "none";
}
function evalIntake(f: WorkflowFacts): IntakeState | undefined {
  if (hasSubmission(f, "intake_request", "approved")) return "approved";
  if (hasSubmission(f, "intake_request", "pending_review")) return "pending_review";
  if (latestStatus(f, "intake_request") === "rejected") return "rejected";
  return undefined;
}

/** מעריך טהור: עובדות → מצב workflow. */
export function evaluateWorkflow(f: WorkflowFacts): WorkflowState {
  const rt = uploadRequiredType(f);
  const steps: Record<StepKey, StepInfo> = {
    sign: { key: "sign", state: evalSign(f) },
    schedule: { key: "schedule", state: evalSchedule(f) },
    upload: { key: "upload", state: evalUpload(f), ...(rt ? { requiredDocumentType: rt } : {}) },
  };
  const cancel = evalCancel(f);
  const intake = evalIntake(f);
  const isCancelled = f.caseStatus === "cancelled" || cancel === "approved";

  let currentStep: StepKey | null = null;
  for (const k of SEQUENCE) {
    if (steps[k].state !== "done") {
      currentStep = k;
      break;
    }
  }
  const allDone = currentStep === null;
  const isComplete = allDone && !isCancelled;

  let nextAction: CustomerActionType | null = null;
  let nextReason: NextReason;
  let blockedOnReview = false;

  if (isCancelled) {
    nextReason = "cancelled";
  } else if (allDone) {
    nextReason = "complete";
  } else {
    const st = steps[currentStep as StepKey].state;
    if (st === "pending_review") {
      blockedOnReview = true;
      nextReason = "blocked_on_review";
    } else if (st === "awaiting_customer") {
      nextAction = STEP_ACTION[currentStep as StepKey];
      nextReason = "awaiting_customer";
    } else if (st === "rejected") {
      nextAction = STEP_ACTION[currentStep as StepKey];
      nextReason = "needs_reissue";
    } else {
      nextAction = STEP_ACTION[currentStep as StepKey];
      nextReason = "needs_issue";
    }
  }

  return {
    caseId: f.caseId,
    caseStatus: f.caseStatus,
    steps,
    cancel,
    ...(intake ? { intake } : {}),
    currentStep,
    nextAction,
    nextReason,
    blockedOnReview,
    isComplete,
    isCancelled,
  };
}
