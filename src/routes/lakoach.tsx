import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  WhatsAppSimulator,
  type IntakeDefaults,
} from "@/components/whatsapp-simulator";
import { useCases } from "@/hooks/use-cases";

type SimMode = "new_customer" | "existing_new_case" | "existing_case";

export const Route = createFileRoute("/lakoach")({
  head: () => ({
    meta: [
      { title: "ממשק לקוח חיצוני — ש.ב.א." },
      { name: "description", content: "סימולציית WhatsApp לקישורי לקוח: חתימה, תיאום והעלאת מסמכים." },
    ],
  }),
  component: LakoachPage,
});

function LakoachPage() {
  const cases = useCases();
  const [mode, setMode] = useState<SimMode>("existing_case");
  const [caseId, setCaseId] = useState<string>("");
  const [customer, setCustomer] = useState<string>("");
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ברירת מחדל לרשימת תיקים קיימים
  useEffect(() => {
    if (mode === "existing_case" && cases.length > 0 && !caseId) {
      setCaseId(cases[0].id);
    }
  }, [mode, cases, caseId]);

  // ברירת מחדל ללקוח קיים
  const customers = Array.from(new Set(cases.map((c) => c.customer))).sort();
  useEffect(() => {
    if (mode === "existing_new_case" && customers.length > 0 && !customer) {
      setCustomer(customers[0]);
    }
  }, [mode, customers, customer]);

  // איפוס תיק שנוצר אוטומטית בעת החלפת מצב
  const changeMode = (m: SimMode) => {
    setMode(m);
    setActiveCaseId(undefined);
  };

  // בוחרים את התיק שייכנס לסימולטור
  const effectiveCaseId =
    mode === "existing_case" ? caseId : activeCaseId;
  const selected = effectiveCaseId
    ? cases.find((c) => c.id === effectiveCaseId)
    : undefined;

  // ערכי ברירת מחדל לטופס intake — שואבים מתיק קודם של אותו לקוח אם יש
  const lastCaseForCustomer =
    mode === "existing_new_case" && customer
      ? cases.find((c) => c.customer === customer)
      : undefined;
  const defaults: IntakeDefaults | undefined =
    mode === "existing_new_case" && customer
      ? {
          company: customer,
          project: lastCaseForCustomer?.project,
          site: lastCaseForCustomer?.site,
          equipmentType: lastCaseForCustomer?.equipmentType,
        }
      : undefined;

  const pendingHeaderSubtitle =
    mode === "new_customer"
      ? "לקוח חדש"
      : mode === "existing_new_case"
        ? customer || "לקוח קיים"
        : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">ממשק לקוח חיצוני</h1>
        <p className="text-sm text-muted-foreground">
          סימולציית WhatsApp להמחשת התקשורת עם הלקוח. כל קישור מוביל לדף פעולה חד-פעמי.
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-xs">
        <Info className="h-4 w-4 shrink-0 text-accent-foreground" />
        <p className="text-accent-foreground">
          סימולציה בלבד — לא מחובר ל-WhatsApp אמיתי. פתיחת/עדכון תיק נשמרים ב-Supabase,
          אך שכבת הלקוח (הודעות, קישורים חד-פעמיים, חתימות, בקשות) היא אבטיפוס ואינה נשמרת ב-Supabase.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">תרחיש סימולציה</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mode-sel">תרחיש</Label>
            <Select value={mode} onValueChange={(v) => changeMode(v as SimMode)}>
              <SelectTrigger id="mode-sel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_customer">לקוח חדש לגמרי</SelectItem>
                <SelectItem value="existing_new_case">
                  לקוח קיים — פתיחת תיק חדש
                </SelectItem>
                <SelectItem value="existing_case">
                  לקוח קיים עם תיק קיים
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "existing_new_case" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-sel">בחירת לקוח קיים</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger id="cust-sel">
                  <SelectValue placeholder={mounted ? "בחר לקוח" : "טוען..."} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "existing_case" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-sel">בחירת תיק קיים</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger id="case-sel">
                  <SelectValue placeholder={mounted ? "בחר תיק" : "טוען..."} />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id} · {c.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activeCaseId && mode !== "existing_case" && (
            <p className="text-xs text-muted-foreground">
              נפתח תיק חדש בעקבות הבקשה: <strong>{activeCaseId}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      <WhatsAppSimulator
        caseData={selected}
        defaults={defaults}
        onCaseCreated={setActiveCaseId}
        pendingHeaderSubtitle={pendingHeaderSubtitle}
        scenario={mode}
      />
    </div>
  );
}
