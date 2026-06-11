// Mock adapter להודעות ללקוח (WhatsApp/SMS/Email) — נתוני דמה בלבד.
// TODO: Replace with Supabase + ספק WhatsApp אמיתי (Epic 6). כרגע status="mock".
import * as store from "./mock/notifications-store";

export const NOTIFICATIONS_EVENT = store.NOTIFICATIONS_EVENT;
export type {
  CustomerNotification,
  NotificationChannel,
} from "./mock/notifications-store";
export { CHANNEL_LABELS } from "./mock/notifications-store";

export const mockNotificationsAdapter = {
  async listForCase(caseId: string) {
    return store.getNotifications(caseId);
  },
  async add(
    input: Omit<store.CustomerNotification, "id" | "sentAt" | "status">,
  ) {
    return store.addNotification(input);
  },
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(NOTIFICATIONS_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type NotificationsAdapter = typeof mockNotificationsAdapter;
