// בידוד לוגיקת התפקידים (RBAC) — מקור אמת יחיד.
// מקור התפקיד: הפרופיל המאומת (Supabase Auth). ה-AuthProvider מזרים את ה-session לכאן
// דרך setAuthSession, וה-adapters/קומפוננטות קוראים getActiveRole/getActiveUserId.

export type Role =
  | "coordinator"
  | "logistics"
  | "factory_manager"
  | "admin"
  | "external_client"; // לא תפקיד עובד — נשמר לתאימות (טוקני לקוח חיצוני)

// שם עתידי אפשרי: logistics => logistics_manager (ידרוש migration + עדכון קוד).
export const ROLE_LABELS: Record<Role, string> = {
  coordinator: "מתאמת החזרות",
  logistics: "מנהלת לוגיסטיקה",
  factory_manager: "מנהלת מפעל (צפייה)",
  admin: "מנהל מערכת",
  external_client: "לקוח חיצוני",
};

export const ROLE_CHANGED_EVENT = "sba.role.changed";

export interface AuthSession {
  userId: string;
  displayName: string;
  role: Role;
}

// מצב session ברמת מודול — מאפשר ל-adapters (לא-React) לקרוא את הזהות הנוכחית.
let current: AuthSession | null = null;

export function setAuthSession(session: AuthSession | null) {
  current = session;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ROLE_CHANGED_EVENT));
  }
}

/** התפקיד הפעיל. ברירת מחדל coordinator כשאין session (למשל מצב mock ללא Auth). */
export function getActiveRole(): Role {
  return current?.role ?? "coordinator";
}

export function getActiveUserId(): string | null {
  return current?.userId ?? null;
}

/** שם להצגה/audit: שם העובד אם ידוע, אחרת תווית התפקיד. */
export function getActiveActorName(): string {
  if (current?.displayName) return current.displayName;
  return ROLE_LABELS[getActiveRole()];
}
