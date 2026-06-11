// נקודת כניסה יחידה לשכבת הנתונים (Data Layer).
// בוחר אוטומטית בין mock (localStorage) ל-Supabase לפי משתני הסביבה.
//
// Day 1: mock בלבד.
// Day 2: כשיתווספו supabase adapters — נחליף כאן את ההשמה לפי SUPABASE_ENABLED.
// כל ה-UI מייבא מכאן בלבד (@/adapters) ולעולם לא ניגש ל-localStorage ישירות.

import { mockCasesAdapter } from "./mockCasesAdapter";
import { mockScheduleAdapter } from "./mockScheduleAdapter";
import { mockActionItemsAdapter } from "./mockActionItemsAdapter";
import { mockDocumentsAdapter } from "./mockDocumentsAdapter";
import { mockAuditAdapter } from "./mockAuditAdapter";
import { mockNotificationsAdapter } from "./mockNotificationsAdapter";
import { mockCustomerLinksAdapter } from "./mockCustomerLinksAdapter";
import { mockRemindersAdapter } from "./mockRemindersAdapter";
import { mockSearchAdapter } from "./mockSearchAdapter";

export const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// TODO Day 2: const useSb = SUPABASE_ENABLED;
//   export const casesAdapter = useSb ? supabaseCasesAdapter : mockCasesAdapter; ...
export const casesAdapter = mockCasesAdapter;
export const scheduleAdapter = mockScheduleAdapter;
export const actionItemsAdapter = mockActionItemsAdapter;
export const documentsAdapter = mockDocumentsAdapter;
export const auditAdapter = mockAuditAdapter;
export const notificationsAdapter = mockNotificationsAdapter;
export const customerLinksAdapter = mockCustomerLinksAdapter;
export const remindersAdapter = mockRemindersAdapter;
export const searchAdapter = mockSearchAdapter;

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

if (typeof window !== "undefined" && !SUPABASE_ENABLED) {
  // הודעת פיתוח — רץ על נתוני דמה מקומיים
  console.info(
    "%c[SBA] רץ על mock adapters (localStorage). הגדר VITE_SUPABASE_URL/ANON_KEY כדי להתחבר ל-Supabase.",
    "color:#6FA32E",
  );
}
