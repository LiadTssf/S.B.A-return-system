import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";

const STORAGE_KEY = "sba.schedules";
const EVENT = "sba.schedules.changed";

/** קורא ו-מעביר נתוני אבטיפוס ישנים (ללא segments) לפורמט החדש */
function read(): Record<string, ReturnSchedule> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      ReturnSchedule & {
        plannedDate?: string;
        truckId?: string;
        driverName?: string;
        driverPhone?: string;
        actualDate?: string;
        notes?: string;
      }
    >;
    const out: Record<string, ReturnSchedule> = {};
    for (const [caseId, s] of Object.entries(raw)) {
      if (Array.isArray((s as ReturnSchedule).segments)) {
        out[caseId] = s as ReturnSchedule;
        continue;
      }
      // מיגרציה ממבנה ישן
      const legacy = s as {
        plannedDate?: string;
        truckId?: string;
        driverName?: string;
        driverPhone?: string;
        actualDate?: string;
        notes?: string;
        updatedAt?: string;
      };
      const hasAny =
        legacy.plannedDate ||
        legacy.truckId ||
        legacy.driverName ||
        legacy.driverPhone ||
        legacy.actualDate;
      out[caseId] = {
        caseId,
        segments: hasAny
          ? [
              {
                id: crypto.randomUUID(),
                plannedDate: legacy.plannedDate,
                truckId: legacy.truckId,
                driverName: legacy.driverName,
                driverPhone: legacy.driverPhone,
                actualDate: legacy.actualDate,
                notes: legacy.notes,
                customerConfirmed: false,
              },
            ]
          : [],
        updatedAt: legacy.updatedAt ?? new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function write(data: Record<string, ReturnSchedule>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(EVENT));
}

export const SCHEDULE_EVENT = EVENT;

export function getSchedule(caseId: string): ReturnSchedule | undefined {
  return read()[caseId];
}

export function getAllSchedules(): Record<string, ReturnSchedule> {
  return read();
}

/** מסדר את כל יומן התיאומים לערך base64 URL-safe לשימוש ב-hash של קישור לקוח */
export function encodeSchedulesForUrl(data: Record<string, ReturnSchedule>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return encodeURIComponent(btoa(bin));
}

/** משחזר תיאומים מ-hash (#s=...) אם קיים — לטיפול במצב של אורגינים שונים בין tabs */
export function rehydrateSchedulesFromHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || !hash.includes("s=")) return;
  try {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const raw = params.get("s");
    if (!raw) return;
    const bin = atob(decodeURIComponent(raw));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const incoming = JSON.parse(json) as Record<string, ReturnSchedule>;
    if (!incoming || typeof incoming !== "object") return;

    const existing = read();
    let changed = false;
    const merged: Record<string, ReturnSchedule> = { ...existing };

    for (const [caseId, schedule] of Object.entries(incoming)) {
      if (!schedule || !Array.isArray(schedule.segments)) continue;
      const current = existing[caseId];
      if (!current || schedule.updatedAt > current.updatedAt) {
        merged[caseId] = schedule;
        changed = true;
      }
    }

    if (changed) write(merged);
  } catch {
    // ignore malformed hash
  }
}

/** סופר כמה סגמנטים (משאיות) מתוזמנים לתאריך נתון. ניתן להחריג segmentId */
export function countSchedulesOnDate(iso: string, excludeSegmentId?: string): number {
  const data = read();
  let count = 0;
  for (const s of Object.values(data)) {
    for (const seg of s.segments) {
      if (excludeSegmentId && seg.id === excludeSegmentId) continue;
      if (seg.plannedDate === iso) count++;
    }
  }
  return count;
}

function ensureCase(data: Record<string, ReturnSchedule>, caseId: string): ReturnSchedule {
  if (!data[caseId]) {
    data[caseId] = { caseId, segments: [], updatedAt: new Date().toISOString() };
  }
  return data[caseId];
}

/** מוסיף סגמנט חדש לתיק ומחזיר את הסגמנט שנוצר */
export function addSegment(
  caseId: string,
  init: Partial<Omit<ScheduleSegment, "id">> = {},
): ScheduleSegment {
  const data = read();
  const sched = ensureCase(data, caseId);
  const seg: ScheduleSegment = {
    id: crypto.randomUUID(),
    customerConfirmed: false,
    ...init,
  };
  sched.segments = [...sched.segments, seg];
  sched.updatedAt = new Date().toISOString();
  data[caseId] = sched;
  write(data);
  return seg;
}

/** מעדכן סגמנט קיים */
export function updateSegment(
  caseId: string,
  segmentId: string,
  patch: Partial<Omit<ScheduleSegment, "id">>,
): ScheduleSegment | undefined {
  const data = read();
  const sched = data[caseId];
  if (!sched) return undefined;
  const idx = sched.segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return undefined;
  sched.segments[idx] = { ...sched.segments[idx], ...patch };
  sched.updatedAt = new Date().toISOString();
  data[caseId] = sched;
  write(data);
  return sched.segments[idx];
}

/** מסיר סגמנט */
export function removeSegment(caseId: string, segmentId: string): void {
  const data = read();
  const sched = data[caseId];
  if (!sched) return;
  sched.segments = sched.segments.filter((s) => s.id !== segmentId);
  sched.updatedAt = new Date().toISOString();
  data[caseId] = sched;
  write(data);
}