import { getAllSubmissions } from "./customer-link-store";
import {
  CUSTOMER_ACTION_LABELS,
  type CustomerSubmission,
} from "@/lib/customer-link-types";
import { getAllSchedules } from "./schedule-store";
import { getAllReminders } from "./reminders-store";
import { getCases } from "./cases-store";
import {
  markHandledByDedupeKey,
  upsertByDedupeKey,
  getAllActionItems,
} from "./action-items-store";
import type { ActionItemPriority } from "@/lib/action-items-types";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function priorityForSubmission(s: CustomerSubmission): ActionItemPriority {
  switch (s.action) {
    case "cancel_request":
      return "urgent";
    case "schedule":
    case "intake_request":
      return "high";
    default:
      return "normal";
  }
}

function titleForSubmission(s: CustomerSubmission): string {
  const label = CUSTOMER_ACTION_LABELS[s.action];
  if (s.payload.type === "schedule") {
    return `${label} מהלקוח`;
  }
  if (s.payload.type === "cancel_request") {
    return "בקשת ביטול/שינוי מועד מהלקוח";
  }
  if (s.payload.type === "upload_doc") {
    return `הלקוח העלה: ${s.payload.title}`;
  }
  if (s.payload.type === "sign_policy") {
    return `הלקוח חתם על נוהל ההחזרה`;
  }
  return label;
}

/**
 * סנכרון חד-פעמי: עובר על מקורות הנתונים ומעדכן/יוצר action items בהתאם.
 * דה-דופ לפי dedupeKey, ולא ניתן "להחזיר לחיים" פריט שכבר טופל/נדחה.
 */
export function syncActionItems() {
  if (typeof window === "undefined") return;

  const cases = getCases();
  const caseById = new Map(cases.map((c) => [c.id, c]));

  // ── 1. Customer submissions ─────────────────────────────────────
  const subs = getAllSubmissions();
  for (const s of subs) {
    const dedupeKey = `sub:${s.id}`;
    const c = caseById.get(s.caseId);
    if (s.status === "pending_review") {
      const type =
        s.action === "schedule"
          ? "customer_schedule_request"
          : s.action === "cancel_request"
            ? "customer_cancel_request"
            : "case_waiting_review";
      upsertByDedupeKey({
        dedupeKey,
        returnCaseId: s.caseId,
        type,
        title: titleForSubmission(s),
        description: undefined,
        priority: priorityForSubmission(s),
        createdBy: "system",
        dueAt: s.submittedAt,
        customer: c?.customer,
        project: c?.project,
      });
    } else if (s.action === "upload_doc" && s.status === "auto_applied") {
      // Auto-applied uploads — surface as a normal info item, but as soon
      // as the coordinator opens the documents section we consider it handled.
      upsertByDedupeKey({
        dedupeKey,
        returnCaseId: s.caseId,
        type: "customer_document_uploaded",
        title: titleForSubmission(s),
        priority: "normal",
        createdBy: "system",
        dueAt: s.submittedAt,
        customer: c?.customer,
        project: c?.project,
      });
    } else if (s.action === "sign_policy" && s.status === "auto_applied") {
      upsertByDedupeKey({
        dedupeKey,
        returnCaseId: s.caseId,
        type: "customer_policy_signed",
        title: titleForSubmission(s),
        priority: "low",
        createdBy: "system",
        dueAt: s.submittedAt,
        customer: c?.customer,
        project: c?.project,
      });
    } else if (s.status === "approved" || s.status === "rejected") {
      // Auto-handle when reviewer already acted
      markHandledByDedupeKey(dedupeKey, s.reviewedBy ?? "system");
    }
  }

  // ── 2. Truck returns today/tomorrow ─────────────────────────────
  const today = todayIso();
  const tomorrow = tomorrowIso();
  const schedules = getAllSchedules();
  for (const sched of Object.values(schedules)) {
    const c = caseById.get(sched.caseId);
    for (const seg of sched.segments) {
      if (!seg.plannedDate || seg.actualDate) continue;
      if (seg.plannedDate === today) {
        upsertByDedupeKey({
          dedupeKey: `seg:${seg.id}:today`,
          returnCaseId: sched.caseId,
          type: "truck_return_today",
          title: `החזרת משאית מתוכננת היום${seg.truckId ? ` · משאית ${seg.truckId}` : ""}`,
          description: seg.driverName
            ? `נהג: ${seg.driverName}${seg.driverPhone ? ` · ${seg.driverPhone}` : ""}`
            : undefined,
          priority: "urgent",
          createdBy: "system",
          dueAt: `${seg.plannedDate}T00:00:00`,
          customer: c?.customer,
          project: c?.project,
        });
      } else if (seg.plannedDate === tomorrow) {
        upsertByDedupeKey({
          dedupeKey: `seg:${seg.id}:tomorrow`,
          returnCaseId: sched.caseId,
          type: "truck_return_tomorrow",
          title: `החזרת משאית מתוכננת מחר${seg.truckId ? ` · משאית ${seg.truckId}` : ""}`,
          priority: "high",
          createdBy: "system",
          dueAt: `${seg.plannedDate}T00:00:00`,
          customer: c?.customer,
          project: c?.project,
        });
      }
    }
    // Mark stale "today/tomorrow" items as handled when segment actualized
    for (const seg of sched.segments) {
      if (seg.actualDate) {
        markHandledByDedupeKey(`seg:${seg.id}:today`, "system");
        markHandledByDedupeKey(`seg:${seg.id}:tomorrow`, "system");
      }
    }
  }

  // ── 3. Reminders due ────────────────────────────────────────────
  const now = Date.now();
  for (const r of getAllReminders()) {
    const due = new Date(r.dueAt).getTime();
    if (Number.isNaN(due)) continue;
    if (due > now) continue;
    const c = caseById.get(r.caseId);
    upsertByDedupeKey({
      dedupeKey: `rem:${r.id}`,
      returnCaseId: r.caseId,
      type: "reminder_due",
      title: r.title,
      description: r.note,
      priority: "high",
      createdBy: r.createdBy,
      dueAt: r.dueAt,
      customer: c?.customer,
      project: c?.project,
    });
  }

  // ── 4. Cleanup: items pointing to deleted cases → dismiss silently ───
  const all = getAllActionItems();
  for (const item of all) {
    if (!caseById.has(item.returnCaseId) && item.status === "open") {
      markHandledByDedupeKey(item.dedupeKey, "system");
    }
  }
}