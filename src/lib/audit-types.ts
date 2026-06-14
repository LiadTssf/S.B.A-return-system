// טיפוסי Audit Log (טהורים). קוד הכתיבה/קריאה נמצא ב-adapters.
import type { Role } from "@/lib/roles";

export type AuditAction =
  | "create_case"
  | "update_case"
  | "close_case"
  | "upload_document"
  | "delete_document"
  | "document_viewed"
  | "document_uploaded"
  | "delivery_note_uploaded"
  | "return_certificate_uploaded"
  | "truck_photo_uploaded"
  | "signed_policy_uploaded"
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
  | "truck_closed"
  | "truck_close_blocked_missing_required_documents"
  | "truck_coordination_closed_successfully";

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
  document_uploaded: "העלאת מסמך",
  delivery_note_uploaded: "העלאת תעודת משלוח",
  return_certificate_uploaded: "העלאת תעודת החזרה",
  truck_photo_uploaded: "העלאת תמונת משאית",
  signed_policy_uploaded: "העלאת נוהל חתום",
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
  truck_close_blocked_missing_required_documents:
    "סגירת תיאום משאית נחסמה — חסרים מסמכים",
  truck_coordination_closed_successfully: "תיאום משאית נסגר בהצלחה",
};
