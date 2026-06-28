import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ExternalShell } from "./external-shell";
import { PrototypeNotice } from "./prototype-notice";
import { SUPABASE_ENABLED } from "@/adapters";
import {
  supabaseCustomerLinksAdapter,
  type TokenValidation,
} from "@/adapters/supabaseCustomerLinksAdapter";
import {
  CUSTOMER_ACTION_LABELS,
  type CustomerActionType,
} from "@/lib/customer-link-types";
import type { DocumentCategory } from "@/lib/document-types";

/** ההקשר המינימלי שמגיע מ-validate_customer_token (נגזר מהטוקן בלבד). */
export interface ExternalTokenContext {
  rawToken: string;
  action: CustomerActionType;
  documentType: DocumentCategory | null;
  projectName: string | null;
  site: string | null;
  expiresAt?: string;
}

interface Props {
  token: string; // הטוקן הגולמי מה-URL — מקור האמת היחיד
  expectedAction: CustomerActionType;
  children: (ctx: ExternalTokenContext) => React.ReactNode;
}

const REASONS: Record<NonNullable<TokenValidation["reason"]>, { title: string; message: string }> = {
  not_found: { title: "הקישור אינו קיים", message: "ייתכן שהקישור הועתק חלקית או שאינו תקין." },
  expired: { title: "הקישור פג תוקף", message: "הקישור היה בתוקף 24 שעות מרגע יצירתו. פני אלינו לקבלת קישור חדש." },
  consumed: { title: "הקישור כבר נוצל", message: "כל קישור מאפשר ביצוע פעולה פעם אחת בלבד." },
  revoked: { title: "הקישור בוטל", message: "הקישור בוטל על ידי הצוות. פני אלינו לקבלת קישור חדש." },
};

/**
 * ולידציה של הטוקן הגולמי מול validate_customer_token (Supabase),
 * גזירת הפעולה המותרת מהטוקן, ורנדור הילד רק כשהכל תקין.
 * אינו סומך על action/caseId/הקשר מפרמטרי ה-URL מעבר לטוקן הגולמי.
 */
export function ExternalTokenGuard({ token, expectedAction, children }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; ctx: ExternalTokenContext }
    | { kind: "error"; title: string; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!SUPABASE_ENABLED) {
        setState({
          kind: "error",
          title: "הקישור אינו זמין",
          message: "אימות הקישורים דורש חיבור Supabase פעיל.",
        });
        return;
      }
      try {
        const v = await supabaseCustomerLinksAdapter.validateToken(token);
        if (!alive) return;
        if (!v.valid) {
          setState({ kind: "error", ...REASONS[v.reason ?? "not_found"] });
          return;
        }
        if (v.action !== expectedAction) {
          setState({
            kind: "error",
            title: "סוג קישור לא מתאים",
            message: `הקישור הזה מיועד ל"${CUSTOMER_ACTION_LABELS[v.action as CustomerActionType]}".`,
          });
          return;
        }
        setState({
          kind: "ok",
          ctx: {
            rawToken: token,
            action: v.action as CustomerActionType,
            documentType: v.documentType ?? null,
            projectName: v.projectName ?? null,
            site: v.site ?? null,
            expiresAt: v.expiresAt,
          },
        });
      } catch {
        if (!alive) return;
        setState({
          kind: "error",
          title: "שגיאה באימות הקישור",
          message: "אירעה תקלה זמנית. נסי שוב מאוחר יותר.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, expectedAction]);

  if (state.kind === "loading") {
    return (
      <ExternalShell title="טוען..." subtitle="אנא המתיני">
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      </ExternalShell>
    );
  }
  if (state.kind === "error") {
    return (
      <ExternalShell title={state.title}>
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-destructive">{state.message}</p>
        </div>
        {!SUPABASE_ENABLED && (
          <PrototypeNotice title="ממשק לקוח חיצוני — דורש Supabase">
            דפי הלקוח החיצוניים פועלים מול שירותי ה-Supabase האמיתיים (validate/submit).
            הגדר VITE_SUPABASE_URL / ANON_KEY כדי להפעילם.
          </PrototypeNotice>
        )}
      </ExternalShell>
    );
  }
  return <>{children(state.ctx)}</>;
}
