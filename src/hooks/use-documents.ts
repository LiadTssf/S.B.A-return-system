import { useCallback, useEffect, useState } from "react";
import { documentsAdapter } from "@/adapters";
import type { CaseDocument } from "@/lib/document-types";

export function useCaseDocuments(caseId: string): CaseDocument[] {
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const refresh = useCallback(() => {
    documentsAdapter.listForCase(caseId).then(setDocs);
  }, [caseId]);
  useEffect(() => {
    refresh();
    return documentsAdapter.subscribe(refresh);
  }, [refresh]);
  return docs;
}
