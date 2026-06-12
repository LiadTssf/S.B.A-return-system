// Supabase adapter ל-Action Items — טבלת action_items (רשומות אמיתיות, ללא נגזרת אוטומטית).
import { getSupabase } from "@/lib/supabase";
import { sortItems } from "./mock/action-items-store";
import type { ActionItem } from "@/lib/action-items-types";

export const ACTION_ITEMS_EVENT = "sba.action_items.changed";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTION_ITEMS_EVENT));
}

function toItem(r: any): ActionItem {
  return {
    id: r.id,
    dedupeKey: r.dedupe_key ?? r.id,
    returnCaseId: r.return_case_id,
    type: r.type,
    title: r.title,
    description: r.description ?? undefined,
    priority: r.priority,
    status: r.status,
    createdBy: r.created_by ?? "system",
    dueAt: r.due_at ?? undefined,
    handledAt: r.handled_at ?? undefined,
    handledBy: r.handled_by ?? undefined,
    dismissedAt: r.dismissed_at ?? undefined,
    dismissedBy: r.dismissed_by ?? undefined,
    metadata: r.metadata ?? undefined,
    customer: r.customer ?? undefined,
    project: r.project ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function listForCaseImpl(caseId: string): Promise<ActionItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("action_items").select("*").eq("return_case_id", caseId);
  if (error) throw error;
  return sortItems((data ?? []).map(toItem));
}

export const supabaseActionItemsAdapter = {
  async listAll(): Promise<ActionItem[]> {
    const sb = getSupabase();
    const { data, error } = await sb.from("action_items").select("*");
    if (error) throw error;
    return sortItems((data ?? []).map(toItem));
  },
  async listForCase(caseId: string): Promise<ActionItem[]> {
    return listForCaseImpl(caseId);
  },
  async listOpenForCase(caseId: string): Promise<ActionItem[]> {
    return (await listForCaseImpl(caseId)).filter((i) => i.status === "open");
  },
  async openCountByCase(): Promise<Record<string, number>> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("action_items")
      .select("return_case_id")
      .eq("status", "open");
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of data ?? []) {
      const cid = r.return_case_id as string;
      if (cid) out[cid] = (out[cid] ?? 0) + 1;
    }
    return out;
  },
  async markHandled(id: string, by: string): Promise<ActionItem | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("action_items")
      .update({ status: "handled", handled_at: now, handled_by: by, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toItem(data) : null;
  },
  async markDismissed(id: string, by: string): Promise<ActionItem | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("action_items")
      .update({ status: "dismissed", dismissed_at: now, dismissed_by: by, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toItem(data) : null;
  },
  async markHandledByKey(dedupeKey: string, by: string): Promise<ActionItem | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("action_items")
      .update({ status: "handled", handled_at: now, handled_by: by, updated_at: now })
      .eq("dedupe_key", dedupeKey)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toItem(data) : null;
  },
  async sync(): Promise<void> {
    // אין נגזרת אוטומטית במצב Supabase — action items הם רשומות אמיתיות.
    // TODO: נגזרות (משאית היום/מחר, תזכורת שהגיע זמנה) יתווספו בהמשך.
  },
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(ACTION_ITEMS_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(ACTION_ITEMS_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};
