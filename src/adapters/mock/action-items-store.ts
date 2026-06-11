import type {
  ActionItem,
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
} from "@/lib/action-items-types";
import { comparePriority } from "@/lib/action-items-types";

const STORAGE_KEY = "sba.action_items";
const EVENT = "sba.action_items.changed";

export const ACTION_ITEMS_EVENT = EVENT;

function read(): ActionItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: ActionItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function getAllActionItems(): ActionItem[] {
  return sortItems(read());
}

export function getActionItemsForCase(caseId: string): ActionItem[] {
  return sortItems(read().filter((i) => i.returnCaseId === caseId));
}

export function getOpenActionItemsForCase(caseId: string): ActionItem[] {
  return getActionItemsForCase(caseId).filter((i) => i.status === "open");
}

export function getOpenCountByCase(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of read()) {
    if (item.status !== "open") continue;
    out[item.returnCaseId] = (out[item.returnCaseId] ?? 0) + 1;
  }
  return out;
}

export function sortItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    // Open before handled before dismissed
    const statusOrder: Record<ActionItemStatus, number> = {
      open: 0,
      handled: 1,
      dismissed: 2,
    };
    const s = statusOrder[a.status] - statusOrder[b.status];
    if (s !== 0) return s;
    const p = comparePriority(a.priority, b.priority);
    if (p !== 0) return p;
    // Earlier due first when both have due
    if (a.dueAt && b.dueAt) {
      const d = a.dueAt.localeCompare(b.dueAt);
      if (d !== 0) return d;
    } else if (a.dueAt) return -1;
    else if (b.dueAt) return 1;
    // Newest first
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface UpsertInput {
  dedupeKey: string;
  returnCaseId: string;
  type: ActionItemType;
  title: string;
  description?: string;
  priority: ActionItemPriority;
  createdBy: string;
  dueAt?: string;
  metadata?: Record<string, unknown>;
  customer?: string;
  project?: string;
}

/**
 * יוצר action item חדש או מעדכן קיים לפי dedupeKey.
 * אם הפריט הופך מ-handled/dismissed חזרה ל-open לא קורה — שומרים על מצבים שנקבעו ע"י משתמש.
 */
export function upsertByDedupeKey(input: UpsertInput): ActionItem {
  const all = read();
  const idx = all.findIndex((i) => i.dedupeKey === input.dedupeKey);
  const now = new Date().toISOString();
  if (idx === -1) {
    const created: ActionItem = {
      id: crypto.randomUUID(),
      dedupeKey: input.dedupeKey,
      returnCaseId: input.returnCaseId,
      type: input.type,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "open",
      createdBy: input.createdBy,
      dueAt: input.dueAt,
      metadata: input.metadata,
      customer: input.customer,
      project: input.project,
      createdAt: now,
      updatedAt: now,
    };
    all.unshift(created);
    write(all);
    return created;
  }
  // Update metadata only — never resurrect a handled/dismissed item
  const existing = all[idx];
  const updated: ActionItem = {
    ...existing,
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueAt: input.dueAt,
    metadata: input.metadata,
    customer: input.customer ?? existing.customer,
    project: input.project ?? existing.project,
    updatedAt: now,
  };
  all[idx] = updated;
  write(all);
  return updated;
}

export function markHandledByDedupeKey(
  dedupeKey: string,
  by: string,
): ActionItem | undefined {
  const all = read();
  const idx = all.findIndex((i) => i.dedupeKey === dedupeKey);
  if (idx === -1) return undefined;
  if (all[idx].status === "handled") return all[idx];
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    status: "handled",
    handledAt: now,
    handledBy: by,
    updatedAt: now,
  };
  write(all);
  return all[idx];
}

export function markHandled(id: string, by: string): ActionItem | undefined {
  const all = read();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return undefined;
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    status: "handled",
    handledAt: now,
    handledBy: by,
    updatedAt: now,
  };
  write(all);
  return all[idx];
}

export function markDismissed(id: string, by: string): ActionItem | undefined {
  const all = read();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return undefined;
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    status: "dismissed",
    dismissedAt: now,
    dismissedBy: by,
    updatedAt: now,
  };
  write(all);
  return all[idx];
}