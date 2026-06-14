// Supabase adapter ל-Audit Log — טבלת audit_logs.
import { getSupabase } from "@/lib/supabase";
import { getActiveRole, getActiveUserId, ROLE_LABELS, type Role } from "@/lib/roles";
import type { AuditAction, AuditEntry } from "@/lib/audit-types";

export const AUDIT_EVENT = "sba.audit.changed";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUDIT_EVENT));
}

function toEntry(r: any): AuditEntry {
  const role = (r.actor_role ?? "coordinator") as Role;
  return {
    id: r.id,
    timestamp: r.created_at,
    role,
    roleLabel: ROLE_LABELS[role] ?? r.actor_id ?? String(role),
    action: r.action_type as AuditAction,
    caseId: r.return_case_id ?? undefined,
    detail: r.description ?? undefined,
  };
}

export const supabaseAuditAdapter = {
  async list(): Promise<AuditEntry[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []).map(toEntry);
  },
  async listForCase(caseId: string): Promise<AuditEntry[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("audit_logs")
      .select("*")
      .eq("return_case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toEntry);
  },
  async log(action: AuditAction, opts?: { caseId?: string; detail?: string }): Promise<void> {
    const sb = getSupabase();
    const role = getActiveRole();
    try {
      const { error } = await sb.from("audit_logs").insert({
        return_case_id: opts?.caseId ?? null,
        action_type: action,
        actor_role: role,
        // משתמש מאומת אמיתי (uuid) כשקיים; נפילה לתווית תפקיד במצב mock
        actor_id: getActiveUserId() ?? ROLE_LABELS[role],
        description: opts?.detail ?? null,
      });
      if (error) throw error;
      emit();
    } catch (e) {
      // Audit הוא משני — לא מפיל את הפעולה הראשית אם הכתיבה נכשלת.
      console.warn("[audit] כתיבת רשומת audit נכשלה:", e);
    }
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
