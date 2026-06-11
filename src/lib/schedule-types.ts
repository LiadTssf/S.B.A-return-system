export type PlannedWindow = "morning" | "afternoon";

/** סגמנט החזרה — משאית אחת בתאריך מסוים. תיק יכול להכיל מספר סגמנטים. */
export interface ScheduleSegment {
  id: string;
  plannedDate?: string; // ISO yyyy-mm-dd
  truckId?: string;
  driverName?: string;
  driverPhone?: string;
  actualDate?: string;
  customerConfirmed?: boolean;
  notes?: string;
}

export interface ReturnSchedule {
  caseId: string;
  segments: ScheduleSegment[];
  updatedAt: string;
}

/** מגבלת מספר ההחזרות ביום */
export const MAX_RETURNS_PER_DAY = 3;

/**
 * חלון זמני החזרה לפי יום בשבוע.
 * א'-ד' (0-3): 09:00–14:00
 * ה' (4): 09:00–13:00
 * ו'-ש' (5-6): סגור
 */
export function getReturnWindow(iso: string): string | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || dow === 1 || dow === 2 || dow === 3) return "09:00–14:00";
  if (dow === 4) return "09:00–13:00";
  return null; // ו' / ש'
}

/** האם היום מאפשר תיאום החזרה (לא שישי/שבת)? */
export function isReturnableDate(date: Date): boolean {
  const dow = date.getDay();
  return dow !== 5 && dow !== 6;
}

/** ממיר Date מקומי ל-ISO yyyy-mm-dd ללא הסטת timezone */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}