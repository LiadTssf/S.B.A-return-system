import type { ReturnCase } from "@/lib/case-types";
import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";
import type {
  CustomerActionType,
  CustomerLinkToken,
  CustomerSubmission,
  CustomerSubmissionPayload,
} from "@/lib/customer-link-types";
import type { CustomerNotification } from "./notifications-store";
import type { AuditEntry, AuditAction } from "@/lib/audit-types";
import { ROLE_LABELS, type Role } from "@/lib/roles";

/** העלה את הגרסה כדי לכפות איפוס ו-reseed בכל הלקוחות הקיימים */
export const SEED_VERSION = "v5-2026-06-jitter";
const SEED_VERSION_KEY = "sba.seed.version";

const KEYS = {
  cases: "sba.cases",
  casesSeeded: "sba.cases.seeded",
  schedules: "sba.schedules",
  tokens: "sba.customer_tokens",
  submissions: "sba.customer_submissions",
  notifications: "sba.notifications",
  audit: "sba_audit_log",
  documents: "sba.documents",
};

const KEEP_KEYS = new Set(["sba_active_role"]);
const PREFIXES = ["sba.", "sba_"];

function wipeAll() {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (KEEP_KEYS.has(k)) continue;
    if (PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

function uuid() {
  return crypto.randomUUID();
}

function isoLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** מוסיף N ימי עסקים (א'-ה') מהיום */
function bizDay(offset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const step = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    const dow = d.getDay();
    if (dow !== 5 && dow !== 6) remaining--;
  }
  return isoLocalDate(d);
}

/**
 * ISO timestamp לפני/אחרי N ימים.
 * שעה ודקה מקבלים jitter דטרמיניסטי לפי מונה גלובלי, כדי שההתראות
 * לא יופיעו כולן באותה שנייה מדויקת.
 */
let tsCounter = 0;
function ts(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  // jitter פסאודו-רנדומלי דטרמיניסטי
  const n = tsCounter++;
  const hourJitter = (n * 37) % 5; // 0..4 שעות
  const minute = (n * 53) % 60;
  const second = (n * 17) % 60;
  const h = Math.max(7, Math.min(18, hour + hourJitter - 2));
  d.setHours(h, minute, second, 0);
  return d.toISOString();
}

function build() {
  const coord = ROLE_LABELS.coordinator;
  const log = ROLE_LABELS.logistics;

  const cases: ReturnCase[] = [];
  const schedules: Record<string, ReturnSchedule> = {};
  const tokens: CustomerLinkToken[] = [];
  const subs: CustomerSubmission[] = [];
  const notifs: CustomerNotification[] = [];
  const audit: AuditEntry[] = [];

  function addSchedule(caseId: string, segs: Partial<ScheduleSegment>[]) {
    schedules[caseId] = {
      caseId,
      segments: segs.map((s) => ({
        id: uuid(),
        customerConfirmed: false,
        ...s,
      })),
      updatedAt: ts(0),
    };
  }

  function addSub(opts: {
    caseId: string;
    action: CustomerActionType;
    daysAgo: number;
    payload: CustomerSubmissionPayload;
    status: CustomerSubmission["status"];
    reviewNote?: string;
  }) {
    const token: CustomerLinkToken = {
      token: uuid(),
      caseId: opts.caseId,
      action: opts.action,
      createdAt: ts(-opts.daysAgo - 1),
      createdBy: coord,
      expiresAt: ts(6),
      consumedAt: ts(-opts.daysAgo, 11),
    };
    tokens.push(token);
    const reviewed = opts.status === "approved" || opts.status === "rejected";
    subs.push({
      id: uuid(),
      token: token.token,
      caseId: opts.caseId,
      action: opts.action,
      submittedAt: ts(-opts.daysAgo, 12),
      payload: opts.payload,
      status: opts.status,
      reviewedAt: reviewed ? ts(-Math.max(opts.daysAgo - 1, 0), 14) : undefined,
      reviewedBy: reviewed ? coord : undefined,
      reviewNote: opts.reviewNote,
    });
  }

  function notif(
    caseId: string,
    message: string,
    daysAgo: number,
    toName: string,
    toContact: string,
  ) {
    notifs.push({
      id: uuid(),
      caseId,
      channel: "whatsapp",
      toName,
      toContact,
      message,
      sentAt: ts(-daysAgo, 13),
      sentBy: coord,
      status: "mock",
    });
  }

  function logEntry(
    action: AuditAction,
    caseId: string,
    detail: string,
    daysAgo: number,
    role: Role = "coordinator",
  ) {
    audit.push({
      id: uuid(),
      timestamp: ts(-daysAgo, 15),
      role,
      roleLabel: ROLE_LABELS[role],
      action,
      caseId,
      detail,
    });
  }

  // ===== 0001 — completed =====
  cases.push({
    id: "SBA-2026-0001",
    customer: "אלקטרה בנייה",
    project: "מגדל רוטשילד 22",
    site: "תל אביב",
    equipmentType: "rental",
    status: "completed",
    createdAt: ts(-28),
    createdBy: coord,
    updatedAt: ts(-3),
    closedAt: ts(-3),
    closedBy: log,
  });
  addSchedule("SBA-2026-0001", [
    {
      plannedDate: bizDay(-4),
      actualDate: bizDay(-3),
      truckId: "T-101",
      driverName: "משה לוי",
      driverPhone: "050-1112233",
      customerConfirmed: true,
      notes: "החזרה הושלמה",
    },
  ]);
  addSub({
    caseId: "SBA-2026-0001",
    action: "sign_policy",
    daysAgo: 20,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "יוסי כהן", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0001",
    action: "schedule",
    daysAgo: 10,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(-4),
      segments: [{ requestedDate: bizDay(-4) }],
    },
  });
  addSub({
    caseId: "SBA-2026-0001",
    action: "upload_doc",
    daysAgo: 3,
    status: "auto_applied",
    payload: { type: "upload_doc", documentId: uuid(), title: "תעודת החזרה חתומה" },
  });
  notif("SBA-2026-0001", "תיק ההחזרה נסגר בהצלחה. תודה רבה!", 3, "יוסי כהן", "050-1112233");
  logEntry("close_case", "SBA-2026-0001", "תיק נסגר ע״י לוגיסטיקה", 3, "logistics");

  // ===== 0002 — awaiting_return (חתום + מאושר, ממתין להחזרה) =====
  cases.push({
    id: "SBA-2026-0002",
    customer: "שיכון ובינוי",
    project: "שכונת רמת השרון מערב",
    site: "רמת השרון",
    equipmentType: "rental",
    status: "awaiting_return",
    createdAt: ts(-14),
    createdBy: coord,
    updatedAt: ts(-1),
  });
  addSchedule("SBA-2026-0002", [
    {
      plannedDate: bizDay(2),
      truckId: "T-205",
      driverName: "אבי דרור",
      driverPhone: "052-2223344",
      customerConfirmed: true,
    },
  ]);
  addSub({
    caseId: "SBA-2026-0002",
    action: "sign_policy",
    daysAgo: 12,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "דנה ישראלי", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0002",
    action: "schedule",
    daysAgo: 5,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(2),
      segments: [{ requestedDate: bizDay(2), note: "ליצור קשר חצי שעה לפני הגעה" }],
    },
  });
  notif(
    "SBA-2026-0002",
    `המועד שלך אושר: ${bizDay(2)} 09:00–14:00`,
    5,
    "דנה ישראלי",
    "054-4445566",
  );

  // ===== 0003 — coordinating (בקשת תיאום ממתינה לאישור) =====
  cases.push({
    id: "SBA-2026-0003",
    customer: "דניה סיבוס",
    project: "מתחם הבורסה רמת גן",
    site: "רמת גן",
    equipmentType: "customer_owned",
    status: "coordinating",
    createdAt: ts(-7),
    createdBy: coord,
    updatedAt: ts(0),
  });
  addSchedule("SBA-2026-0003", []);
  addSub({
    caseId: "SBA-2026-0003",
    action: "sign_policy",
    daysAgo: 6,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "רונן ברק", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0003",
    action: "schedule",
    daysAgo: 1,
    status: "pending_review",
    payload: {
      type: "schedule",
      requestedDate: bizDay(5),
      note: "מבקש שתי משאיות באותו יום",
      segments: [
        { requestedDate: bizDay(5), note: "משאית ראשונה - 9:00" },
        { requestedDate: bizDay(5), note: "משאית שנייה - לאחר 12:00" },
      ],
    },
  });

  // ===== 0004 — in_review (הוחזר, מסמך הועלה, ממתין לתעודה) =====
  cases.push({
    id: "SBA-2026-0004",
    customer: "אשטרום",
    project: "פארק תעשייה כפר סבא",
    site: "כפר סבא",
    equipmentType: "rental",
    status: "in_review",
    createdAt: ts(-10),
    createdBy: coord,
    updatedAt: ts(-1),
  });
  addSchedule("SBA-2026-0004", [
    {
      plannedDate: bizDay(-2),
      actualDate: bizDay(-2),
      truckId: "T-310",
      driverName: "סלים פרץ",
      driverPhone: "053-3334455",
      customerConfirmed: true,
    },
  ]);
  addSub({
    caseId: "SBA-2026-0004",
    action: "sign_policy",
    daysAgo: 9,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "תמר אבני", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0004",
    action: "schedule",
    daysAgo: 6,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(-2),
      segments: [{ requestedDate: bizDay(-2) }],
    },
  });
  addSub({
    caseId: "SBA-2026-0004",
    action: "upload_doc",
    daysAgo: 1,
    status: "auto_applied",
    payload: { type: "upload_doc", documentId: uuid(), title: "תעודת משלוח החזרה" },
  });

  // ===== 0005 — awaiting_return — 3 משאיות באותו יום (תאריך חסום לדמו) =====
  cases.push({
    id: "SBA-2026-0005",
    customer: "אלקטרה בנייה",
    project: "קומפלקס מודיעין צפון",
    site: "מודיעין",
    equipmentType: "rental",
    status: "awaiting_return",
    createdAt: ts(-9),
    createdBy: coord,
    updatedAt: ts(-2),
  });
  addSchedule("SBA-2026-0005", [
    {
      plannedDate: bizDay(3),
      truckId: "T-401",
      driverName: "עומר נחום",
      driverPhone: "050-5556677",
      customerConfirmed: true,
    },
    {
      plannedDate: bizDay(3),
      truckId: "T-402",
      driverName: "אלי שמש",
      driverPhone: "050-6667788",
      customerConfirmed: true,
    },
    {
      plannedDate: bizDay(3),
      truckId: "T-403",
      driverName: "ניר רביב",
      driverPhone: "050-7778899",
      customerConfirmed: true,
    },
  ]);
  addSub({
    caseId: "SBA-2026-0005",
    action: "sign_policy",
    daysAgo: 8,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "ליאור מזרחי", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0005",
    action: "schedule",
    daysAgo: 4,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(3),
      segments: [
        { requestedDate: bizDay(3) },
        { requestedDate: bizDay(3) },
        { requestedDate: bizDay(3) },
      ],
    },
  });

  // ===== 0006 — open — חתם בלבד, עוד לא תיאם =====
  cases.push({
    id: "SBA-2026-0006",
    customer: "מנרב פרויקטים",
    project: "מסילת רכבת קלה ירושלים",
    site: "ירושלים",
    equipmentType: "customer_owned",
    status: "open",
    createdAt: ts(-3),
    createdBy: coord,
    updatedAt: ts(-1),
  });
  addSchedule("SBA-2026-0006", []);
  addSub({
    caseId: "SBA-2026-0006",
    action: "sign_policy",
    daysAgo: 2,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "מירי דהן", signatureDataUrl: "", agreed: true },
  });

  // ===== 0007 — cancelled — בקשת ביטול אושרה =====
  cases.push({
    id: "SBA-2026-0007",
    customer: "אפריקה ישראל",
    project: "מגדלי השרון",
    site: "הרצליה",
    equipmentType: "rental",
    status: "cancelled",
    createdAt: ts(-21),
    createdBy: coord,
    updatedAt: ts(-5),
    closedAt: ts(-5),
    closedBy: coord,
  });
  addSchedule("SBA-2026-0007", [
    {
      plannedDate: bizDay(-8),
      truckId: "T-501",
      driverName: "שגיא ויצמן",
      driverPhone: "054-1112233",
      customerConfirmed: true,
    },
  ]);
  addSub({
    caseId: "SBA-2026-0007",
    action: "sign_policy",
    daysAgo: 18,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "אורית בן-דוד", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0007",
    action: "schedule",
    daysAgo: 12,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(-8),
      segments: [{ requestedDate: bizDay(-8) }],
    },
  });
  addSub({
    caseId: "SBA-2026-0007",
    action: "cancel_request",
    daysAgo: 6,
    status: "approved",
    payload: { type: "cancel_request", reason: "הפרויקט הוקפא לחודשיים" },
    reviewNote: "אושר. נחזור בעת חידוש הפעילות.",
  });

  // ===== 0008 — coordinating — בקשת תיאום שנדחתה (לקוח אמור לשלוח שוב) =====
  cases.push({
    id: "SBA-2026-0008",
    customer: "ב.ס.ט. בנייה",
    project: "מתחם ריט באר שבע",
    site: "באר שבע",
    equipmentType: "rental_and_customer",
    status: "coordinating",
    createdAt: ts(-6),
    createdBy: coord,
    updatedAt: ts(-1),
  });
  addSchedule("SBA-2026-0008", []);
  addSub({
    caseId: "SBA-2026-0008",
    action: "sign_policy",
    daysAgo: 5,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "סיגל אזולאי", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0008",
    action: "schedule",
    daysAgo: 2,
    status: "rejected",
    payload: {
      type: "schedule",
      requestedDate: bizDay(1),
      segments: [{ requestedDate: bizDay(1), note: "מועד דחוף" }],
    },
    reviewNote: "התאריך עמוס. נשמח לבחון מועד אחר.",
  });

  // ===== 0009 — awaiting_return — בקשת ביטול ממתינה לאישור =====
  cases.push({
    id: "SBA-2026-0009",
    customer: "כהן פיתוח",
    project: "בית חולים אסותא חיפה",
    site: "חיפה",
    equipmentType: "rental",
    status: "awaiting_return",
    createdAt: ts(-11),
    createdBy: coord,
    updatedAt: ts(0),
  });
  addSchedule("SBA-2026-0009", [
    {
      plannedDate: bizDay(4),
      truckId: "T-610",
      driverName: "אסף ורד",
      driverPhone: "058-1234567",
      customerConfirmed: true,
    },
  ]);
  addSub({
    caseId: "SBA-2026-0009",
    action: "sign_policy",
    daysAgo: 10,
    status: "auto_applied",
    payload: { type: "sign_policy", signerName: "עמית כהן", signatureDataUrl: "", agreed: true },
  });
  addSub({
    caseId: "SBA-2026-0009",
    action: "schedule",
    daysAgo: 7,
    status: "approved",
    payload: {
      type: "schedule",
      requestedDate: bizDay(4),
      segments: [{ requestedDate: bizDay(4) }],
    },
  });
  addSub({
    caseId: "SBA-2026-0009",
    action: "cancel_request",
    daysAgo: 0,
    status: "pending_review",
    payload: { type: "cancel_request", reason: "צריך לדחות בשבוע בגלל עיכוב באתר" },
  });

  // ===== 0010 — open — תיק חדש לגמרי, אין שום פעולה =====
  cases.push({
    id: "SBA-2026-0010",
    customer: "רולידר",
    project: "מרכז לוגיסטי שוהם",
    site: "שוהם",
    equipmentType: "rental",
    status: "open",
    createdAt: ts(0),
    createdBy: coord,
    updatedAt: ts(0),
  });
  addSchedule("SBA-2026-0010", []);

  return { cases, schedules, tokens, subs, notifs, audit };
}

export function ensureSeed() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SEED_VERSION_KEY) === SEED_VERSION) return;

  wipeAll();

  const { cases, schedules, tokens, subs, notifs, audit } = build();

  localStorage.setItem(KEYS.cases, JSON.stringify(cases));
  localStorage.setItem(KEYS.casesSeeded, "1");
  localStorage.setItem(KEYS.schedules, JSON.stringify(schedules));
  localStorage.setItem(KEYS.tokens, JSON.stringify(tokens));
  localStorage.setItem(KEYS.submissions, JSON.stringify(subs));
  localStorage.setItem(KEYS.notifications, JSON.stringify(notifs));
  localStorage.setItem(KEYS.audit, JSON.stringify(audit));
  localStorage.setItem(KEYS.documents, JSON.stringify([]));
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);

  window.dispatchEvent(new Event("sba.cases.changed"));
  window.dispatchEvent(new Event("sba.schedules.changed"));
  window.dispatchEvent(new Event("sba.customer.changed"));
  window.dispatchEvent(new Event("sba.notifications.changed"));
  window.dispatchEvent(new Event("sba.documents.changed"));
}