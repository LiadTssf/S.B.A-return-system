// נקודת כניסה יחידה לשכבת הנתונים (Data Layer).
// בוחר אוטומטית בין mock (localStorage) ל-Supabase לפי משתני הסביבה.
// כל ה-UI מייבא מכאן בלבד (@/adapters) ולעולם לא ניגש ל-localStorage ישירות.

import { SUPABASE_ENABLED } from "./config";

import { mockCasesAdapter } from "./mockCasesAdapter";
import { mockScheduleAdapter } from "./mockScheduleAdapter";
import { mockActionItemsAdapter } from "./mockActionItemsAdapter";
import { mockDocumentsAdapter } from "./mockDocumentsAdapter";
import { mockAuditAdapter } from "./mockAuditAdapter";
import { mockNotificationsAdapter } from "./mockNotificationsAdapter";
import { mockCustomerLinksAdapter } from "./mockCustomerLinksAdapter";
import { mockRemindersAdapter } from "./mockRemindersAdapter";
import { mockSearchAdapter } from "./mockSearchAdapter";

import { supabaseCasesAdapter } from "./supabaseCasesAdapter";
import { supabaseScheduleAdapter } from "./supabaseScheduleAdapter";
import { supabaseActionItemsAdapter } from "./supabaseActionItemsAdapter";
import { supabaseAuditAdapter } from "./supabaseAuditAdapter";
import { supabaseSearchAdapter } from "./supabaseSearchAdapter";

export { SUPABASE_ENABLED };

// ── מחובר ל-Supabase (Day 2 — חיבור ראשוני) ──
export const casesAdapter: typeof mockCasesAdapter = SUPABASE_ENABLED
  ? supabaseCasesAdapter
  : mockCasesAdapter;
export const scheduleAdapter: typeof mockScheduleAdapter = SUPABASE_ENABLED
  ? supabaseScheduleAdapter
  : mockScheduleAdapter;
export const actionItemsAdapter: typeof mockActionItemsAdapter = SUPABASE_ENABLED
  ? supabaseActionItemsAdapter
  : mockActionItemsAdapter;
export const auditAdapter: typeof mockAuditAdapter = SUPABASE_ENABLED
  ? supabaseAuditAdapter
  : mockAuditAdapter;
export const searchAdapter: typeof mockSearchAdapter = SUPABASE_ENABLED
  ? supabaseSearchAdapter
  : mockSearchAdapter;

// ── עדיין mock (השלב הבא) ──
// documents: Base64 — יוחלף ב-Supabase Storage (PART 2).
// customer-links / notifications: mock (מוגנים מדליפת seed במצב Supabase).
// reminders: mock.
export const documentsAdapter = mockDocumentsAdapter;
export const notificationsAdapter = mockNotificationsAdapter;
export const customerLinksAdapter = mockCustomerLinksAdapter;
export const remindersAdapter = mockRemindersAdapter;

// טיפוסים ועזרים נפוצים — חשיפה דרך משטח ייבוא יחיד
export type { CaseInput } from "./mockCasesAdapter";
export type { AddDocumentInput } from "./mockDocumentsAdapter";
export type {
  CustomerNotification,
  NotificationChannel,
} from "./mockNotificationsAdapter";
export { CHANNEL_LABELS } from "./mockNotificationsAdapter";
export type { Reminder, ReminderType } from "./mockRemindersAdapter";
export { REMINDER_TYPE_LABELS } from "./mockRemindersAdapter";
export type { SearchFilters, SearchHit } from "./mockSearchAdapter";
export { EMPTY_FILTERS } from "./mockSearchAdapter";

if (typeof window !== "undefined") {
  if (SUPABASE_ENABLED) {
    console.info(
      "%c[SBA] מחובר ל-Supabase. תיקים/תיאום/action-items/audit/חיפוש = DB. מסמכים/לקוח/התראות = עדיין mock.",
      "color:#6FA32E",
    );
  } else {
    console.info(
      "%c[SBA] רץ על mock adapters (localStorage). הגדר VITE_SUPABASE_URL/ANON_KEY כדי להתחבר ל-Supabase.",
      "color:#F39200",
    );
  }
}
