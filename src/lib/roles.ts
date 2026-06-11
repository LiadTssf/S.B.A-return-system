// בידוד לוגיקת התפקידים (RBAC) — מקור אמת יחיד למערכת.
// כרגע התפקיד הפעיל נשמר מקומית לצורכי פיתוח בלבד (אין עדיין אימות אמיתי).
// TODO: יוחלף ב-Supabase Auth + טבלת users + RLS (אכיפה בצד שרת).

export type Role = "coordinator" | "logistics" | "factory_manager" | "external_client";

// מיפוי לשמות התפקידים המיועדים לפרודקשן (כשנוסיף Auth):
//   coordinator      => return_coordinator
//   logistics        => logistics_manager
//   factory_manager  => plant_manager
//   (admin — יתווסף בעתיד)

export const ROLE_LABELS: Record<Role, string> = {
  coordinator: "מתאמת החזרות",
  logistics: "מנהלת לוגיסטיקה",
  factory_manager: "מנהלת מפעל (צפייה)",
  external_client: "לקוח חיצוני",
};

const STORAGE_KEY = "sba_active_role";
export const ROLE_CHANGED_EVENT = "sba.role.changed";

export function getActiveRole(): Role {
  if (typeof window === "undefined") return "coordinator";
  return (localStorage.getItem(STORAGE_KEY) as Role) ?? "coordinator";
}

export function setActiveRole(role: Role) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, role);
  window.dispatchEvent(new Event(ROLE_CHANGED_EVENT));
}
