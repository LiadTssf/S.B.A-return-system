// Mock adapter לתזכורות פנימיות — נתוני דמה ב-localStorage.
// TODO: Replace with Supabase implementation.
import * as store from "./mock/reminders-store";

export const REMINDERS_EVENT = store.REMINDERS_EVENT;
export type { Reminder, ReminderType } from "./mock/reminders-store";
export { REMINDER_TYPE_LABELS } from "./mock/reminders-store";

export const mockRemindersAdapter = {
  async listAll() {
    return store.getAllReminders();
  },
  async listForCase(caseId: string) {
    return store.getRemindersForCase(caseId);
  },
  async create(input: {
    caseId: string;
    title: string;
    type: store.ReminderType;
    dueAt: string;
    note?: string;
    createdBy: string;
  }) {
    return store.createReminder(input);
  },
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(REMINDERS_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(REMINDERS_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type RemindersAdapter = typeof mockRemindersAdapter;
