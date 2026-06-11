export type ActionItemType =
  | "customer_schedule_request"
  | "customer_cancel_request"
  | "customer_document_uploaded"
  | "customer_policy_signed"
  | "customer_link_expired"
  | "reminder_due"
  | "truck_return_today"
  | "truck_return_tomorrow"
  | "case_waiting_review";

export type ActionItemPriority = "urgent" | "high" | "normal" | "low";
export type ActionItemStatus = "open" | "handled" | "dismissed";

export type FocusSection = "submissions" | "messages" | "documents" | "schedule";

export interface ActionItem {
  id: string;
  /** Stable identifier across syncs so we don't duplicate the same item */
  dedupeKey: string;
  returnCaseId: string;
  type: ActionItemType;
  title: string;
  description?: string;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  createdBy: string;
  dueAt?: string;
  handledAt?: string;
  handledBy?: string;
  dismissedAt?: string;
  dismissedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Denormalized for display */
  customer?: string;
  project?: string;
}

export const ACTION_ITEM_TYPE_LABELS: Record<ActionItemType, string> = {
  customer_schedule_request: "בקשת תיאום מהלקוח",
  customer_cancel_request: "בקשת ביטול/שינוי מועד",
  customer_document_uploaded: "תעודת משלוח הועלתה",
  customer_policy_signed: "הלקוח חתם על נוהל",
  customer_link_expired: "קישור ללקוח פג תוקף",
  reminder_due: "תזכורת לטיפול",
  truck_return_today: "החזרת משאית — היום",
  truck_return_tomorrow: "החזרת משאית — מחר",
  case_waiting_review: "תיק ממתין לבדיקה",
};

export const PRIORITY_LABELS: Record<ActionItemPriority, string> = {
  urgent: "דחוף",
  high: "גבוה",
  normal: "רגיל",
  low: "נמוך",
};

const PRIORITY_RANK: Record<ActionItemPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function comparePriority(a: ActionItemPriority, b: ActionItemPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

export function getFocusSectionForType(type: ActionItemType): FocusSection {
  switch (type) {
    case "customer_schedule_request":
    case "truck_return_today":
    case "truck_return_tomorrow":
      return "schedule";
    case "customer_document_uploaded":
      return "documents";
    case "customer_link_expired":
    case "reminder_due":
      return "messages";
    case "customer_cancel_request":
    case "customer_policy_signed":
    case "case_waiting_review":
    default:
      return "submissions";
  }
}