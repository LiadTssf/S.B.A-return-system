// Mock adapter ל-Audit Log — נתוני דמה ב-localStorage.
// TODO: Replace this adapter with Supabase implementation (טבלת audit_logs).
import * as store from "./mock/audit-store";
import type { AuditAction, AuditEntry } from "@/lib/audit-types";

export const AUDIT_EVENT = store.AUDIT_EVENT;

export const mockAuditAdapter = {
  async list(): Promise<AuditEntry[]> {
    return store.getAuditLog();
  },
  async listForCase(caseId: string): Promise<AuditEntry[]> {
    return store.getAuditLog().filter((e) => e.caseId === caseId);
  },
  async log(
    action: AuditAction,
    opts?: { caseId?: string; detail?: string },
  ): Promise<void> {
    store.logAudit(action, opts);
  },
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(AUDIT_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(AUDIT_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type AuditAdapter = typeof mockAuditAdapter;
