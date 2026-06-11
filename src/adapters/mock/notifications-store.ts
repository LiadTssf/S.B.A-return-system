export type NotificationChannel = "whatsapp" | "sms" | "email";

export interface CustomerNotification {
  id: string;
  caseId: string;
  channel: NotificationChannel;
  toName: string;
  toContact: string;
  message: string;
  sentAt: string;
  sentBy: string;
  status: "sent" | "mock";
}

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

const STORAGE_KEY = "sba.notifications";
const EVENT = "sba.notifications.changed";

function read(): CustomerNotification[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: CustomerNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export const NOTIFICATIONS_EVENT = EVENT;

export function getNotifications(caseId: string): CustomerNotification[] {
  return read()
    .filter((n) => n.caseId === caseId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function addNotification(
  input: Omit<CustomerNotification, "id" | "sentAt" | "status">,
): CustomerNotification {
  const entry: CustomerNotification = {
    ...input,
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
    status: "mock",
  };
  const items = read();
  items.unshift(entry);
  write(items);
  return entry;
}