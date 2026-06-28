// hooks לנתוני לקוח אמיתיים (Supabase): טוקנים והגשות לתיק.
// במצב mock (ללא Supabase) מחזירים ריק — זרימת הלקוח מבוססת-Supabase בלבד.
import { useCallback, useEffect, useState } from "react";
import { SUPABASE_ENABLED } from "@/adapters";
import {
  supabaseCustomerLinksAdapter,
  type SubmissionRecord,
  type TokenRecord,
} from "@/adapters/supabaseCustomerLinksAdapter";

export function useCaseSubmissions(caseId: string) {
  const [items, setItems] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!SUPABASE_ENABLED || !caseId) {
      setItems([]);
      return;
    }
    setLoading(true);
    supabaseCustomerLinksAdapter
      .submissionsForCase(caseId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [caseId]);
  useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  return { items, loading, refresh };
}

export function useCaseTokens(caseId: string) {
  const [items, setItems] = useState<TokenRecord[]>([]);
  const refresh = useCallback(() => {
    if (!SUPABASE_ENABLED || !caseId) {
      setItems([]);
      return;
    }
    supabaseCustomerLinksAdapter
      .tokensForCase(caseId)
      .then(setItems)
      .catch(() => setItems([]));
  }, [caseId]);
  useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  return { items, refresh };
}
