// Audit Log — מימוש mock ב-localStorage. TODO: Replace with Supabase implementation.
import { getActiveRole, ROLE_LABELS } from "@/lib/roles";
import type { AuditAction, AuditEntry } from "@/lib/audit-types";

const STORAGE_KEY = "sba_audit_log";
export const AUDIT_EVENT = "sba.audit.changed";

export function getAuditLog(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function logAudit(
  action: AuditAction,
  opts?: { caseId?: string; detail?: string },
) {
  if (typeof window === "undefined") return;
  const role = getActiveRole();
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    role,
    roleLabel: ROLE_LABELS[role],
    action,
    caseId: opts?.caseId,
    detail: opts?.detail,
  };
  const log = getAuditLog();
  log.unshift(entry);
  // log לא ניתן למחיקה ע"י משתמשי קצה; שומרים עד 1000 רשומות באבטיפוס
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, 1000)));
  window.dispatchEvent(new Event(AUDIT_EVENT));
}
