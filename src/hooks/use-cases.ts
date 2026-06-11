import { useCallback, useEffect, useState } from "react";
import { casesAdapter } from "@/adapters";
import type { ReturnCase } from "@/lib/case-types";

export function useCases(): ReturnCase[] {
  const [cases, setCases] = useState<ReturnCase[]>([]);
  const refresh = useCallback(() => {
    casesAdapter.list().then(setCases);
  }, []);
  useEffect(() => {
    casesAdapter.init();
    refresh();
    return casesAdapter.subscribe(refresh);
  }, [refresh]);
  return cases;
}

export function useCase(id: string): ReturnCase | undefined {
  const [c, setC] = useState<ReturnCase | undefined>(undefined);
  const refresh = useCallback(() => {
    casesAdapter.get(id).then((v) => setC(v ?? undefined));
  }, [id]);
  useEffect(() => {
    casesAdapter.init();
    refresh();
    return casesAdapter.subscribe(refresh);
  }, [refresh]);
  return c;
}
