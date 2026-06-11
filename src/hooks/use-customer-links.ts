import { useCallback, useEffect, useState } from "react";
import { customerLinksAdapter } from "@/adapters";
import type {
  CustomerLinkToken,
  CustomerSubmission,
} from "@/lib/customer-link-types";

export function useCaseTokens(caseId: string): CustomerLinkToken[] {
  const [items, setItems] = useState<CustomerLinkToken[]>([]);
  const refresh = useCallback(() => {
    customerLinksAdapter.tokensForCase(caseId).then(setItems);
  }, [caseId]);
  useEffect(() => {
    refresh();
    return customerLinksAdapter.subscribe(refresh);
  }, [refresh]);
  return items;
}

export function useCaseSubmissions(caseId: string): CustomerSubmission[] {
  const [items, setItems] = useState<CustomerSubmission[]>([]);
  const refresh = useCallback(() => {
    customerLinksAdapter.submissionsForCase(caseId).then(setItems);
  }, [caseId]);
  useEffect(() => {
    refresh();
    return customerLinksAdapter.subscribe(refresh);
  }, [refresh]);
  return items;
}

export function usePendingSubmissions(caseId: string): CustomerSubmission[] {
  const [items, setItems] = useState<CustomerSubmission[]>([]);
  const refresh = useCallback(() => {
    customerLinksAdapter.pendingForCase(caseId).then(setItems);
  }, [caseId]);
  useEffect(() => {
    refresh();
    return customerLinksAdapter.subscribe(refresh);
  }, [refresh]);
  return items;
}
