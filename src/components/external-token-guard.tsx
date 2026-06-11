import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ExternalShell } from "./external-shell";
import { casesAdapter, customerLinksAdapter, auditAdapter } from "@/adapters";
import {
  CUSTOMER_ACTION_LABELS,
  type CustomerActionType,
  type CustomerLinkToken,
} from "@/lib/customer-link-types";
import type { ReturnCase } from "@/lib/case-types";

interface Props {
  token: string;
  expectedAction: CustomerActionType;
  children: (ctx: { token: CustomerLinkToken; caseData: ReturnCase }) => React.ReactNode;
}

// TODO: replace token validation with Supabase customer_tokens table
/** ולידציה ל-token, לוגינג של ביקור, ורנדור של הילד רק כשהכל תקין. */
export function ExternalTokenGuard({ token, expectedAction, children }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; t: CustomerLinkToken; c: ReturnCase }
    | { kind: "error"; title: string; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const v = await customerLinksAdapter.validateToken(token);
      if (!v.ok) {
        const map = {
          not_found: { title: "הקישור אינו קיים", message: "ייתכן שהקישור הועתק חלקית או שנמחק." },
          expired: { title: "הקישור פג תוקף", message: "הקישור היה בתוקף 7 ימים מרגע יצירתו. פני אלינו לקבלת קישור חדש." },
          consumed: { title: "הקישור כבר נוצל", message: "כל קישור מאפשר ביצוע פעולה פעם אחת בלבד." },
        } as const;
        setState({ kind: "error", ...map[v.reason] });
        return;
      }
      if (v.token.action !== expectedAction) {
        setState({
          kind: "error",
          title: "סוג קישור לא מתאים",
          message: `הקישור הזה מיועד ל"${CUSTOMER_ACTION_LABELS[v.token.action]}".`,
        });
        return;
      }
      casesAdapter.rehydrateFromHash();
      const c = await casesAdapter.get(v.token.caseId);
      if (!c) {
        setState({ kind: "error", title: "התיק אינו קיים", message: "לא נמצא תיק תואם לקישור זה." });
        return;
      }
      auditAdapter.log("external_link_visit", {
        caseId: c.id,
        detail: CUSTOMER_ACTION_LABELS[v.token.action],
      });
      setState({ kind: "ok", t: v.token, c });
    })();
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
      </ExternalShell>
    );
  }
  return <>{children({ token: state.t, caseData: state.c })}</>;
}
