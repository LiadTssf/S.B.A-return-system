import { useEffect, useState } from "react";
import { documentsAdapter } from "@/adapters";
import type { CaseDocument } from "@/lib/document-types";

// מחזיר URL לצפייה/הורדה של מסמך.
// mock → dataUrl (Base64); Supabase → signed URL מ-Storage.
export function useDocUrl(doc: CaseDocument | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!doc) {
      setUrl(null);
      return;
    }
    documentsAdapter
      .getViewUrl(doc)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [doc]);
  return url;
}
