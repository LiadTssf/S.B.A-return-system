export type ReminderType =
  | "customer_doc_upload"
  | "customer_return_date"
  | "confirm_schedule"
  | "other";

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  customer_doc_upload: "להזכיר ללקוח להעלות תעודת משלוח",
  customer_return_date: "להזכיר ללקוח על מועד החזרה",
  confirm_schedule: "לבדוק אישור תיאום",
  other: "אחר",
};

export interface Reminder {
  id: string;
  caseId: string;
  title: string;
  type: ReminderType;
  /** ISO datetime when the reminder is due */
  dueAt: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

const STORAGE_KEY = "sba.reminders";
const EVENT = "sba.reminders.changed";

export const REMINDERS_EVENT = EVENT;

function read(): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function getAllReminders(): Reminder[] {
  return read().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function getRemindersForCase(caseId: string): Reminder[] {
  return getAllReminders().filter((r) => r.caseId === caseId);
}

export function createReminder(input: {
  caseId: string;
  title: string;
  type: ReminderType;
  dueAt: string;
  note?: string;
  createdBy: string;
}): Reminder {
  const r: Reminder = {
    id: crypto.randomUUID(),
    caseId: input.caseId,
    title: input.title,
    type: input.type,
    dueAt: input.dueAt,
    note: input.note,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  const all = read();
  all.unshift(r);
  write(all);
  return r;
}