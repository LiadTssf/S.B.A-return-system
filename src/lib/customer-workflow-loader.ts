// טוען עובדות workflow אמיתיות מ-Supabase ומפעיל את המעריך הטהור.
// שירות צד-Supabase (מקור האמת לזרימת הלקוח). נצרך ב-5C ע"י הדפים החיצוניים/סימולטור.
// משתמש ישירות באדפטרי ה-Supabase (זהה לבחירת index במצב Supabase) — אין mock fallback.
import { supabaseCasesAdapter } from "@/adapters/supabaseCasesAdapter";
import { supabaseScheduleAdapter } from "@/adapters/supabaseScheduleAdapter";
import { supabaseDocumentsAdapter } from "@/adapters/supabaseDocumentsAdapter";
import { supabaseCustomerLinksAdapter } from "@/adapters/supabaseCustomerLinksAdapter";
import {
  evaluateWorkflow,
  type NextReason,
  type WorkflowFacts,
  type WorkflowState,
} from "./customer-workflow";
import type { CustomerActionType } from "./customer-link-types";

/** אוסף ומנרמל עובדות אמת לתיק נתון. */
export async function loadWorkflowFacts(caseId: string): Promise<WorkflowFacts> {
  const [c, schedule, documents, tokens, submissions] = await Promise.all([
    supabaseCasesAdapter.get(caseId),
    supabaseScheduleAdapter.getForCase(caseId),
    supabaseDocumentsAdapter.listForCase(caseId),
    supabaseCustomerLinksAdapter.tokensForCase(caseId),
    supabaseCustomerLinksAdapter.submissionsForCase(caseId),
  ]);
  if (!c) throw new Error(`workflow: case not found (${caseId})`);

  // תיאום הושלם = קיים segment עם תאריך מתוכנן ואישור לקוח (truck_coordination אמיתי).
  const confirmedSchedule = (schedule?.segments ?? []).some(
    (s) => !!s.plannedDate && !!s.customerConfirmed,
  );

  return {
    caseId,
    caseStatus: c.status,
    tokens: tokens.map((t) => ({
      action: t.action,
      status: t.status,
      expiresAtMs: Date.parse(t.expiresAt),
      documentType: t.documentType,
    })),
    submissions: submissions.map((s) => ({
      action: s.action,
      status: s.status,
      submittedAtMs: Date.parse(s.submittedAt),
    })),
    documentTypes: Array.from(new Set(documents.map((d) => d.category))),
    confirmedSchedule,
    nowMs: Date.now(),
  };
}

/** מצב ה-workflow המלא לתיק (נגזר מנתוני אמת). */
export async function getWorkflowState(caseId: string): Promise<WorkflowState> {
  return evaluateWorkflow(await loadWorkflowFacts(caseId));
}

/** הפעולה הבאה של הלקוח (או null) + סיבה. */
export async function getNextAction(
  caseId: string,
): Promise<{ action: CustomerActionType | null; reason: NextReason }> {
  const s = await getWorkflowState(caseId);
  return { action: s.nextAction, reason: s.nextReason };
}
