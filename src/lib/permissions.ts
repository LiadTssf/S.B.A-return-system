import type { Role } from "@/lib/roles";

// מטריצת הרשאות לפי תפקיד (RBAC) — נשמרת כפי שהוגדרה באבטיפוס.
// TODO: בעתיד תיאכף גם בצד שרת (Supabase RLS), לא רק ב-UI.

export const CAN_CREATE_CASE: Role[] = ["coordinator", "logistics"];
export const CAN_EDIT_CASE: Role[] = ["coordinator", "logistics"];
export const CAN_CHANGE_STATUS: Role[] = ["coordinator", "logistics"];
export const CAN_CLOSE_CASE: Role[] = ["coordinator", "logistics"];
export const CAN_VIEW_CASES: Role[] = ["coordinator", "logistics", "factory_manager"];

export const CAN_SET_SCHEDULE: Role[] = ["coordinator", "logistics"];
export const CAN_ASSIGN_TRUCK: Role[] = ["coordinator", "logistics"];
export const CAN_MARK_RETURNED: Role[] = ["coordinator", "logistics"];
export const CAN_SEND_NOTIFICATION: Role[] = ["coordinator", "logistics"];
export const CAN_CONFIRM_CUSTOMER: Role[] = ["coordinator", "logistics"];

export const CAN_UPLOAD_DOCUMENT: Role[] = ["coordinator", "logistics"];
export const CAN_DELETE_DOCUMENT: Role[] = ["coordinator", "logistics"];
export const CAN_VIEW_DOCUMENTS: Role[] = ["coordinator", "logistics", "factory_manager"];

export const CAN_CREATE_CUSTOMER_LINK: Role[] = ["coordinator", "logistics"];
export const CAN_REVIEW_CUSTOMER_SUBMISSION: Role[] = ["coordinator", "logistics"];

export const CAN_VIEW_NOTIFICATIONS: Role[] = [
  "coordinator",
  "logistics",
  "factory_manager",
];
export const CAN_HANDLE_NOTIFICATION: Role[] = ["coordinator", "logistics"];
export const CAN_DISMISS_NOTIFICATION: Role[] = ["coordinator", "logistics"];
export const CAN_CREATE_REMINDER: Role[] = ["coordinator", "logistics"];

export function can(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}
