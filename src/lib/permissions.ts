import type { Role } from "@/lib/roles";

// מטריצת הרשאות מרכזית (RBAC) — נקודת שינוי אחת.
// MVP: admin = הכל · coordinator/logistics = כתיבה תפעולית · factory_manager = צפייה בלבד.
// (factory_manager כצפייה-בלבד היא מדיניות MVP ראשונית, לא החלטה עסקית סופית.)
// תיאכף גם בצד שרת ב-RLS (migration 0006).

const OPERATIONAL: Role[] = ["coordinator", "logistics", "admin"]; // כתיבה תפעולית
const INTERNAL_VIEW: Role[] = ["coordinator", "logistics", "factory_manager", "admin"]; // צפייה לכל עובד פעיל

export const CAN_CREATE_CASE = OPERATIONAL;
export const CAN_EDIT_CASE = OPERATIONAL;
export const CAN_CHANGE_STATUS = OPERATIONAL;
export const CAN_CLOSE_CASE = OPERATIONAL;
export const CAN_VIEW_CASES = INTERNAL_VIEW;

export const CAN_SET_SCHEDULE = OPERATIONAL;
export const CAN_ASSIGN_TRUCK = OPERATIONAL;
export const CAN_MARK_RETURNED = OPERATIONAL;
export const CAN_SEND_NOTIFICATION = OPERATIONAL;
export const CAN_CONFIRM_CUSTOMER = OPERATIONAL;

export const CAN_UPLOAD_DOCUMENT = OPERATIONAL;
export const CAN_DELETE_DOCUMENT = OPERATIONAL;
export const CAN_VIEW_DOCUMENTS = INTERNAL_VIEW;

export const CAN_CREATE_CUSTOMER_LINK = OPERATIONAL;
export const CAN_REVIEW_CUSTOMER_SUBMISSION = OPERATIONAL;

export const CAN_VIEW_NOTIFICATIONS = INTERNAL_VIEW;
export const CAN_HANDLE_NOTIFICATION = OPERATIONAL;
export const CAN_DISMISS_NOTIFICATION = OPERATIONAL;
export const CAN_CREATE_REMINDER = OPERATIONAL;

export function can(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}
