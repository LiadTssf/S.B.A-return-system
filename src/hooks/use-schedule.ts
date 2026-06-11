import { useCallback, useEffect, useState } from "react";
import { scheduleAdapter } from "@/adapters";
import type { ReturnSchedule } from "@/lib/schedule-types";

export function useSchedule(caseId: string): ReturnSchedule | undefined {
  const [s, setS] = useState<ReturnSchedule | undefined>(undefined);
  const refresh = useCallback(() => {
    scheduleAdapter.getForCase(caseId).then((v) => setS(v ?? undefined));
  }, [caseId]);
  useEffect(() => {
    refresh();
    return scheduleAdapter.subscribe(refresh);
  }, [refresh]);
  return s;
}

export function useAllSchedules(): Record<string, ReturnSchedule> {
  const [m, setM] = useState<Record<string, ReturnSchedule>>({});
  const refresh = useCallback(() => {
    scheduleAdapter.getAll().then(setM);
  }, []);
  useEffect(() => {
    refresh();
    return scheduleAdapter.subscribe(refresh);
  }, [refresh]);
  return m;
}
