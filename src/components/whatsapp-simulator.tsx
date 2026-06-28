// סימולטור WhatsApp — לקוח דק לבדיקת ה-workflow. אינו מחזיק state machine משלו:
// קורא getWorkflowState (Supabase אמיתי) ומניע פעולות דרך השירותים המשותפים
// (issue/replace token → דף לקוח חיצוני אמיתי). אינו יוצר רשומות תפעוליות מזויפות.
// אינו WhatsApp אמיתי (אין Meta API/webhooks/templates).
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkflowState } from "@/lib/customer-workflow-loader";
import type { StepKey, StepState, WorkflowState } from "@/lib/customer-workflow";
import {
  supabaseCustomerLinksAdapter,
  CustomerLinkError,
} from "@/adapters/supabaseCustomerLinksAdapter";
import { casesAdapter, SUPABASE_ENABLED } from "@/adapters";
import {
  CUSTOMER_ACTION_PATHS,
  type CustomerActionType,
} from "@/lib/customer-link-types";
import type { DocumentCategory } from "@/lib/document-types";
import type { EquipmentType, ReturnCase } from "@/lib/case-types";
import { toast } from "sonner";

export interface IntakeDefaults {
  customerName?: string;
  company?: string;
  phone?: string;
  project?: string;
  site?: string;
  equipmentType?: EquipmentType;
}
export type SimScenario = "new_customer" | "existing_new_case" | "existing_case";

interface Props {
  caseData?: ReturnCase;
  defaults?: IntakeDefaults;
  onCaseCreated?: (caseId: string) => void;
  pendingHeaderSubtitle?: string;
  scenario?: SimScenario;
}

const STEP_LABELS: Record<StepKey, string> = {
  sign: "חתימה על נוהל",
  schedule: "תיאום מועד החזרה",
  upload: "העלאת מסמך",
};
const STATE_LABELS: Record<StepState, string> = {
  not_started: "טרם החל",
  awaiting_customer: "ממתין ללקוח",
  pending_review: "בבדיקת הצוות",
  done: "הושלם",
  rejected: "נדחה — דרוש קישור חדש",
};
// תוויות כפתור + הודעה לכל פעולת לקוח — כולן נפתחות דרך הדף החיצוני האמיתי.
const ACTION_LABEL: Record<CustomerActionType, string> = {
  sign_policy: "פתיחת קישור חתימה",
  upload_doc: "המשך להעלאת מסמך",
  schedule: "פתח דף תיאום מועד",
  cancel_request: "פתח דף בקשת ביטול / שינוי",
  intake_request: "פתיחת בקשת החזרה",
};
const NEXT_MSG: Record<CustomerActionType, string> = {
  sign_policy: "השלב הבא: חתימה על נוהל ההחזרה.",
  schedule: "השלב הבא: תיאום מועד החזרה.",
  upload_doc: "השלב הבא: העלאת תעודת מסמך.",
  cancel_request: "ניתן לשלוח בקשת ביטול / שינוי מועד.",
  intake_request: "פתיחת בקשת החזרה חדשה.",
};

function Shell({ subtitle, children }: { subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-[oklch(0.35_0.08_150)] px-4 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 font-bold">ש</div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">ש.ב.א. — בוט החזרות</span>
          <span className="text-[11px] opacity-80">{subtitle ?? "לקוח"}</span>
        </div>
        <Badge variant="outline" className="ms-auto border-white/30 bg-white/10 text-[10px] text-white">
          סימולציה בלבד
        </Badge>
      </div>
      <CardContent className="flex flex-col gap-3 p-4" style={{ backgroundColor: "oklch(0.97 0.01 145)" }}>
        {children}
      </CardContent>
    </Card>
  );
}

export function WhatsAppSimulator({ caseData, defaults, onCaseCreated, pendingHeaderSubtitle, scenario = "new_customer" }: Props) {
  if (!SUPABASE_ENABLED) {
    return (
      <Shell subtitle={pendingHeaderSubtitle}>
        <p className="text-sm text-muted-foreground">
          הסימולטור פועל מול שירותי ה-workflow של Supabase. הגדר חיבור Supabase כדי להשתמש בו.
        </p>
      </Shell>
    );
  }
  if (!caseData) {
    return (
      <Shell subtitle={pendingHeaderSubtitle}>
        <p className="whitespace-pre-line text-sm text-foreground">
          {scenario === "existing_new_case"
            ? "פתיחת בקשת החזרה חדשה ללקוח קיים. מלא את הפרטים ליצירת תיק."
            : "שלום וברכה, הגעת למערכת ניהול ההחזרות של ש.ב.א. לפתיחת בקשה, מלא את הפרטים."}
        </p>
        <IntakeForm defaults={defaults} caseData={caseData} onCaseCreated={onCaseCreated} />
      </Shell>
    );
  }
  return <WorkflowView caseData={caseData} />;
}

function WorkflowView({ caseData }: { caseData: ReturnCase }) {
  const [wf, setWf] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getWorkflowState(caseData.id)
      .then(setWf)
      .catch(() => setWf(null))
      .finally(() => setLoading(false));
  }, [caseData.id]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // הנפקה/החלפה של טוקן אמיתי ופתיחת דף הלקוח החיצוני (שם מתבצעת ההגשה האמיתית).
  const openActionLink = async (action: CustomerActionType) => {
    if (acting) return;
    setActing(true);
    try {
      const tokens = await supabaseCustomerLinksAdapter.tokensForCase(caseData.id);
      const active = tokens.find(
        (t) => t.action === action && t.status === "active" && Date.parse(t.expiresAt) > Date.now(),
      );
      // upload_doc דורש document_type בהנפקה; ברירת מחדל לסימולטור = תעודת משלוח.
      const documentType: DocumentCategory | undefined =
        action === "upload_doc" ? "delivery_note" : undefined;
      const issued = active
        ? await supabaseCustomerLinksAdapter.replaceToken(active.id)
        : await supabaseCustomerLinksAdapter.issueToken({ caseId: caseData.id, action, documentType });
      const url = `${window.location.origin}/c/${issued.token}/${CUSTOMER_ACTION_PATHS[action]}`;
      window.open(url, "_blank");
      toast.success("נפתח דף הלקוח בלשונית חדשה");
    } catch (e) {
      toast.error(e instanceof CustomerLinkError ? e.message : "פתיחת הקישור נכשלה");
    } finally {
      setActing(false);
      load();
    }
  };

  const subtitle = `${caseData.customer} · ${caseData.id}`;

  return (
    <Shell subtitle={subtitle}>
      <p className="text-sm text-foreground">
        שלום {caseData.customer}, להלן מצב תהליך החזרת הציוד בתיק {caseData.id}.
      </p>

      {loading && !wf ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      ) : !wf ? (
        <p className="text-sm text-destructive">לא ניתן לטעון את מצב התהליך.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            {(["sign", "schedule", "upload"] as StepKey[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span>{STEP_LABELS[k]}</span>
                <Badge
                  variant="outline"
                  className={
                    wf.steps[k].state === "done"
                      ? "border-primary/40 text-primary"
                      : wf.steps[k].state === "pending_review"
                        ? "border-accent/50 bg-accent/10 text-accent-foreground"
                        : wf.steps[k].state === "rejected"
                          ? "border-destructive/40 text-destructive"
                          : "text-muted-foreground"
                  }
                >
                  {STATE_LABELS[wf.steps[k].state]}
                </Badge>
              </div>
            ))}
            {wf.cancel !== "none" && (
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                <span>בקשת ביטול / שינוי</span>
                <Badge variant="outline" className="text-muted-foreground">{wf.cancel}</Badge>
              </div>
            )}
          </div>

          <NextActionPanel wf={wf} acting={acting} onAct={openActionLink} />

          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1 self-start text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            רענן מצב
          </Button>
        </>
      )}
    </Shell>
  );
}

function NextActionPanel({
  wf,
  acting,
  onAct,
}: {
  wf: WorkflowState;
  acting: boolean;
  onAct: (a: CustomerActionType) => void;
}) {
  if (wf.isCancelled) {
    return <Bot>התהליך בוטל.</Bot>;
  }
  if (wf.isComplete) {
    return (
      <>
        <Bot>תהליך ההחזרה הושלם. תודה!</Bot>
        {/* ביטול/שינוי הוא ענף אופציונלי גם לאחר השלמה */}
        <ActionButton label="בקשת ביטול / שינוי" disabled={acting} onClick={() => onAct("cancel_request")} />
      </>
    );
  }
  if (wf.blockedOnReview) {
    return <Bot>הבקשה התקבלה וממתינה לאישור הצוות. נעדכן בהמשך.</Bot>;
  }
  if (!wf.nextAction) {
    return <Bot>אין כרגע פעולה נדרשת.</Bot>;
  }
  // כל פעולת לקוח (כולל sign_policy/upload_doc) נפתחת דרך הדף החיצוני האמיתי.
  const action = wf.nextAction;
  return (
    <>
      <Bot>{NEXT_MSG[action]}</Bot>
      <ActionButton label={ACTION_LABEL[action]} disabled={acting} onClick={() => onAct(action)} />
    </>
  );
}

function Bot({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[90%] rounded-lg bg-white px-3 py-2 text-sm shadow-sm">{children}</div>;
}
function ActionButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="gap-2 self-start" disabled={disabled} onClick={onClick}>
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function IntakeForm({
  caseData,
  defaults,
  onCaseCreated,
}: {
  caseData?: ReturnCase;
  defaults?: IntakeDefaults;
  onCaseCreated?: (caseId: string) => void;
}) {
  const [company, setCompany] = useState(defaults?.company ?? caseData?.customer ?? "");
  const [project, setProject] = useState(defaults?.project ?? caseData?.project ?? "");
  const [site, setSite] = useState(defaults?.site ?? caseData?.site ?? "");
  const [equipmentType, setEquipmentType] = useState<EquipmentType>(defaults?.equipmentType ?? "rental");
  const [busy, setBusy] = useState(false);

  const canSubmit = company.trim().length >= 2 && project.trim().length >= 2 && site.trim().length >= 2;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      // יצירת תיק אמיתי ב-Supabase (אין רשומת intake מזויפת — יצירת התיק היא ה-intake).
      const created = await casesAdapter.create({
        customer: company.trim(),
        project: project.trim(),
        site: site.trim(),
        equipmentType,
      });
      toast.success("נפתח תיק החזרה");
      onCaseCreated?.(created.id);
    } catch {
      toast.error("פתיחת התיק נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md bg-white p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ik-co" className="text-xs">שם החברה *</Label>
          <Input id="ik-co" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ik-proj" className="text-xs">שם הפרויקט *</Label>
          <Input id="ik-proj" value={project} onChange={(e) => setProject(e.target.value)} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="ik-site" className="text-xs">אתר / כתובת איסוף *</Label>
          <Input id="ik-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={120} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label className="text-xs">סוג ציוד *</Label>
          <Select value={equipmentType} onValueChange={(v) => setEquipmentType(v as EquipmentType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rental">ציוד שכור</SelectItem>
              <SelectItem value="customer_owned">ציוד בבעלות לקוח</SelectItem>
              <SelectItem value="rental_and_customer">ציוד שכור + ציוד לקוח</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={submit} disabled={!canSubmit || busy} className="gap-2 self-end">
        <Send className="h-3.5 w-3.5" />
        {busy ? "פותח..." : "פתיחת תיק החזרה"}
      </Button>
    </div>
  );
}
