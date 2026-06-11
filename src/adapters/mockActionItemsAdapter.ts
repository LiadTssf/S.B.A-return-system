// Mock adapter ל-Action Items / התראות — נתוני דמה ב-localStorage.
// TODO: Replace this adapter with Supabase implementation.
import * as store from "./mock/action-items-store";
import { syncActionItems } from "./mock/action-items-sync";
import type { ActionItem } from "@/lib/action-items-types";

export const ACTION_ITEMS_EVENT = store.ACTION_ITEMS_EVENT;

export const mockActionItemsAdapter = {
  async listAll(): Promise<ActionItem[]> {
    return store.getAllActionItems();
  },
  async listForCase(caseId: string): Promise<ActionItem[]> {
    return store.getActionItemsForCase(caseId);
  },
  async listOpenForCase(caseId: string): Promise<ActionItem[]> {
    return store.getOpenActionItemsForCase(caseId);
  },
  async openCountByCase(): Promise<Record<string, number>> {
    return store.getOpenCountByCase();
  },
  async markHandled(id: string, by: string): Promise<ActionItem | null> {
    return store.markHandled(id, by) ?? null;
  },
  async markDismissed(id: string, by: string): Promise<ActionItem | null> {
    return store.markDismissed(id, by) ?? null;
  },
  async markHandledByKey(dedupeKey: string, by: string): Promise<ActionItem | null> {
    return store.markHandledByDedupeKey(dedupeKey, by) ?? null;
  },
  /** סנכרון נגזרות (הגשות/תיאומים/תזכורות) ל-action items */
  async sync(): Promise<void> {
    syncActionItems();
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

export type ActionItemsAdapter = typeof mockActionItemsAdapter;
