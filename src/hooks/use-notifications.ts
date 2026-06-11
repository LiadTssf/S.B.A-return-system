import { useCallback, useEffect, useState } from "react";
import { notificationsAdapter, type CustomerNotification } from "@/adapters";

export function useNotifications(caseId: string): CustomerNotification[] {
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const refresh = useCallback(() => {
    notificationsAdapter.listForCase(caseId).then(setItems);
  }, [caseId]);
  useEffect(() => {
    refresh();
    return notificationsAdapter.subscribe(refresh);
  }, [refresh]);
  return items;
}
