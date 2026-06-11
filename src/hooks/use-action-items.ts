import { useCallback, useEffect, useState } from "react";
import {
  actionItemsAdapter,
  casesAdapter,
  customerLinksAdapter,
  remindersAdapter,
  scheduleAdapter,
} from "@/adapters";
import type { ActionItem } from "@/lib/action-items-types";

// מנוי משולב: כל מקורות הנתונים שמשפיעים על action items
function useCombinedSubscription(handler: () => void) {
  useEffect(() => {
    handler();
    const unsub = [
      actionItemsAdapter.subscribe(handler),
      remindersAdapter.subscribe(handler),
      customerLinksAdapter.subscribe(handler),
      scheduleAdapter.subscribe(handler),
    ];
    return () => unsub.forEach((u) => u());
  }, [handler]);
}

export function useAllActionItems(): ActionItem[] {
  const [items, setItems] = useState<ActionItem[]>([]);
  const refresh = useCallback(() => {
    actionItemsAdapter.listAll().then(setItems);
  }, []);
  useCombinedSubscription(refresh);
  return items;
}

export function useActionItemsForCase(caseId: string): ActionItem[] {
  const [items, setItems] = useState<ActionItem[]>([]);
  const refresh = useCallback(() => {
    actionItemsAdapter.listForCase(caseId).then(setItems);
  }, [caseId]);
  useCombinedSubscription(refresh);
  return items;
}

export function useOpenActionItemsForCase(caseId: string): ActionItem[] {
  const [items, setItems] = useState<ActionItem[]>([]);
  const refresh = useCallback(() => {
    actionItemsAdapter.listOpenForCase(caseId).then(setItems);
  }, [caseId]);
  useCombinedSubscription(refresh);
  return items;
}

export function useOpenCountByCase(): Record<string, number> {
  const [map, setMap] = useState<Record<string, number>>({});
  const refresh = useCallback(() => {
    actionItemsAdapter.openCountByCase().then(setMap);
  }, []);
  useCombinedSubscription(refresh);
  return map;
}

/**
 * Hook גלובלי: מריץ סנכרון נגזרות ב-mount + בכל שינוי מקור + כל 60 שניות,
 * כדי שתזכורות/התראות שהגיע זמנן יופיעו ללא רענון ידני.
 */
export function useActionItemsSync() {
  useEffect(() => {
    casesAdapter.init();
    actionItemsAdapter.sync();
    const onChange = () => actionItemsAdapter.sync();
    const unsub = [
      customerLinksAdapter.subscribe(onChange),
      scheduleAdapter.subscribe(onChange),
      remindersAdapter.subscribe(onChange),
    ];
    const interval = window.setInterval(() => actionItemsAdapter.sync(), 60_000);
    return () => {
      unsub.forEach((u) => u());
      window.clearInterval(interval);
    };
  }, []);
}
