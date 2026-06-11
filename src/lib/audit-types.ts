// טיפוסי Audit Log (טהורים). קוד הכתיבה/קריאה נמצא ב-adapters.
import type { Role } from "@/lib/roles";

export type AuditAction =
  | "create_case"
  | "update_case"
  | "close_case"
  | "upload_document"
  | "delete_document"
  | "document_viewed"
  | "external_link_visit"
  | "schedule_message"
  | "send_message"
  | "login_attempt"
  | "unauthorized_access"
  | "schedule_set"
  | "truck_assigned"
  | "return_actual"
  | "customer_confirmed"
  | "notification_sent"
  | "customer_link_created"
  | "policy_signed"
  | "customer_schedule_request"
  | "customer_doc_uploaded"
  | "customer_cancel_request"
  | "customer_submission_approved"
  | "customer_submission_rejected"
  | "reminder_created"
  | "action_item_handled"
  | "action_item_dismissed"
  | "truck_close_blocked"
  | "truck_closed";

export interface AuditEntry {
  id: string;
  timestamp: string;
  role: Role;
  roleLabel: string;
  action: AuditAction;
  caseId?: string;
  detail?: string;
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  create_case: "פתיחת תיק",
  update_case: "עדכון תיק",
  close_case: "סגירת תיק",
  upload_document: "העלאת מסמך",
  delete_document: "מחיקת מסמך",
  document_viewed: "צפייה/הורדת מסמך",
  external_link_visit: "כניסת לקוח חיצוני",
  schedule_message: "תזמון הודעה",
  send_message: "שליחת הודעה",
  login_attempt: "ניסיון כניסה",
  unauthorized_access: "גישה לא מורשית",
  schedule_set: "תיאום תאריך החזרה",
  truck_assigned: "שיוך משאית",
  return_actual: "סימון החזרה בפועל",
  customer_confirmed: "אישור לקוח התקבל",
  notification_sent: "הודעת תיאום ללקוח",
  customer_link_created: "יצירת קישור ללקוח",
  policy_signed: "חתימה דיגיטלית של לקוח",
  customer_schedule_request: "בקשת תיאום מהלקוח",
  customer_doc_uploaded: "העלאת מסמך ע״י הלקוח",
  customer_cancel_request: "בקשת ביטול מהלקוח",
  customer_submission_approved: "אישור בקשת לקוח",
  customer_submission_rejected: "דחיית בקשת לקוח",
  reminder_created: "תזכורת פנימית חדשה",
  action_item_handled: "סימון פעולה כטופלה",
  action_item_dismissed: "התעלמות מפעולה",
  truck_close_blocked: "סגירת תיאום משאית נחסמה",
  truck_closed: "סגירת תיאום משאית",
};
