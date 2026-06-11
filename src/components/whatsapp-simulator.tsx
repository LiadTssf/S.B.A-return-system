import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PlayCircle, Send } from "lucide-react";
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
import {
  useCaseSubmissions,
  useCaseTokens,
} from "@/hooks/use-customer-links";
import { useSchedule } from "@/hooks/use-schedule";
import { useNotifications } from "@/hooks/use-notifications";
import { customerLinksAdapter, casesAdapter, scheduleAdapter, auditAdapter } from "@/adapters";
import { CUSTOMER_SYNC_MESSAGE } from "@/adapters/mockCustomerLinksAdapter";
// mergeDocuments אינו חשוף ב-documentsAdapter — נצרך לסנכרון בין-טאבי בלבד (mock)
import { mergeDocuments } from "@/adapters/mock/documents-store";
import {
  CUSTOMER_ACTION_LABELS,
  CUSTOMER_ACTION_PATHS,
  getScheduleRequestSegments,
  type CustomerActionType,
  type CustomerLinkToken,
  type CustomerSubmission,
} from "@/lib/customer-link-types";
import type { EquipmentType, ReturnCase } from "@/lib/case-types";
import { EQUIPMENT_LABELS } from "@/lib/case-types";
import type { ReturnSchedule } from "@/lib/schedule-types";
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
  /** מופעל לאחר שליחת intake של לקוח חדש / תיק חדש (לאחר createCase) */
  onCaseCreated?: (caseId: string) => void;
  /** כותרת מותאמת בראש הצ'אט כאשר עוד אין caseData */
  pendingHeaderSubtitle?: string;
  /** תרחיש הסימולציה — משפיע על הברכה ועל דילוג intake לתיקים קיימים */
  scenario?: SimScenario;
}

const STARTED_KEY = (id: string) => `sba.bot_started.${id}`;

function tokenUrl(
  t: CustomerLinkToken,
  schedules: Record<string, ReturnSchedule>,
  c?: ReturnCase,
) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  // הוספת הטוקן + נתוני התיק כ-hash כדי לאפשר rehydration גם אם נפתח באורג'ין אחר
  const tPart = `t=${customerLinksAdapter.encodeTokenForUrl(t)}`;
  const cPart = c ? `&c=${casesAdapter.encodeForUrl(c)}` : "";
  const sPart = typeof window !== "undefined" ? `&s=${scheduleAdapter.encodeForUrl(schedules)}` : "";
  return `${base}/c/${t.token}/${CUSTOMER_ACTION_PATHS[t.action]}#${tPart}${cPart}${sPart}`;
}

function formatHebDate(iso: string) {
  // יום-חודש-שנה
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatScheduleSubmission(
  payload: Extract<CustomerSubmission["payload"], { type: "schedule" }>,
) {
  return getScheduleRequestSegments(payload)
    .map(
      (segment, index) =>
        `משאית ${index + 1}: ${formatHebDate(segment.requestedDate)}${segment.note ? `\n${segment.note}` : ""}`,
    )
    .join("\n");
}

type Bubble = {
  id: string;
  from: "bot" | "user";
  text?: string;
  action?: { label: string; onClick: () => void; href?: string };
  customNode?: React.ReactNode;
};

export function WhatsAppSimulator({
  caseData,
  defaults,
  onCaseCreated,
  pendingHeaderSubtitle,
  scenario = "new_customer",
}: Props) {
  const tokens = useCaseTokens(caseData?.id ?? "");
  const submissions = useCaseSubmissions(caseData?.id ?? "");
  const schedule = useSchedule(caseData?.id ?? "");
  const notifications = useNotifications(caseData?.id ?? "");
  const [started, setStarted] = useState(false);

  // טעינת/שמירת דגל "התחלת תהליך"
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!caseData) return; // בלי תיק — שומרים started ב-state מקומי בלבד
    const v = localStorage.getItem(STARTED_KEY(caseData.id));
    if (v === "1" || tokens.length > 0 || submissions.length > 0) {
      setStarted(true);
    }
  }, [caseData, tokens.length, submissions.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        source?: string;
        documents?: unknown[];
        submissions?: unknown[];
      };
      if (data?.source !== CUSTOMER_SYNC_MESSAGE) return;
      customerLinksAdapter.mergeState({
        submissions: Array.isArray(data.submissions)
          ? (data.submissions as CustomerSubmission[])
          : undefined,
      });
      if (Array.isArray(data.documents)) {
        mergeDocuments(data.documents as import("@/lib/document-types").CaseDocument[]);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ולידציה של intake
  const intakeSubs = useMemo(
    () => submissions.filter((s) => s.action === "intake_request"),
    [submissions],
  );
  const pendingIntake = intakeSubs.find((s) => s.status === "pending_review");
  // בתרחיש "תיק קיים" — מתייחסים ל-intake כאל אישור קיים מראש (התיק כבר נפתח)
  const skipIntake = scenario === "existing_case" && !!caseData;
  const approvedIntake = intakeSubs.find((s) => s.status === "approved");
  const rejectedIntake =
    !pendingIntake && !approvedIntake
      ? intakeSubs.find((s) => s.status === "rejected")
      : undefined;

  // ולידציה של submissions
  const signSub = useMemo(
    () =>
      submissions.find(
        (s) => s.action === "sign_policy" && s.status === "auto_applied",
      ),
    [submissions],
  );
  const scheduleSubs = useMemo(
    () => submissions.filter((s) => s.action === "schedule"),
    [submissions],
  );
  const pendingSchedule = scheduleSubs.find((s) => s.status === "pending_review");
  const approvedSchedule = scheduleSubs.find((s) => s.status === "approved");
  const rejectedSchedule =
    !pendingSchedule && !approvedSchedule
      ? scheduleSubs.find((s) => s.status === "rejected")
      : undefined;
  const uploadSub = submissions.find(
    (s) => s.action === "upload_doc" && s.status === "auto_applied",
  );
  const cancelSubs = submissions.filter((s) => s.action === "cancel_request");
  const pendingCancel = cancelSubs.find((s) => s.status === "pending_review");
  const approvedCancel = cancelSubs.find((s) => s.status === "approved");
  const rejectedCancel =
    !pendingCancel && !approvedCancel
      ? cancelSubs.find((s) => s.status === "rejected")
      : undefined;
  const hasConfirmedSchedule =
    caseData?.status === "awaiting_return" ||
    (schedule?.segments ?? []).some((segment) => !!segment.plannedDate && !!segment.customerConfirmed);

  /** מוצא טוקן פעיל (לא פג, לא נוצל) לפעולה, אחרת יוצר חדש ופותח */
  const openAction = async (action: CustomerActionType) => {
    if (!caseData) return;
    const existing = tokens.find(
      (t) =>
        t.action === action &&
        !t.consumedAt &&
        new Date(t.expiresAt).getTime() > Date.now(),
    );
    const t =
      existing ??
      (await customerLinksAdapter.createToken({
        caseId: caseData.id,
        action,
        createdBy: "סימולציית בוט",
      }));
    if (!existing) {
      auditAdapter.log("customer_link_created", {
        caseId: caseData.id,
        detail: `בוט: ${CUSTOMER_ACTION_LABELS[action]}`,
      });
    }
    const schedules = await scheduleAdapter.getAll();
    window.open(tokenUrl(t, schedules, caseData), "_blank");
  };

  const handleStart = () => {
    if (typeof window !== "undefined" && caseData) {
      localStorage.setItem(STARTED_KEY(caseData.id), "1");
    }
    setStarted(true);
  };

  // בניית רצף הבועות לפי מצב התהליך
  const bubbles: Bubble[] = [];

  // 1. ברכת פתיחה
  const greetText =
    scenario === "existing_case" && caseData
      ? `שלום ${caseData.customer}, חזרת למערכת ניהול ההחזרות של S.B.A.\n\nנמשיך מהשלב בו עצרנו בתיק ${caseData.id}.`
      : scenario === "existing_new_case"
        ? `שלום, נעים לראותך שוב במערכת ניהול ההחזרות של S.B.A.\n\nניתן לפתוח כאן בקשת החזרה חדשה.`
        : `שלום וברכה, הגעת למערכת ניהול ההחזרות של חברת S.B.A.\n\nכאן ניתן להגיש בקשה להחזרת ציוד ולהתקדם בתהליך שלב אחר שלב.`;
  bubbles.push({
    id: "greet",
    from: "bot",
    text: greetText,
  });

  // הודעות מתאמת/לוגיסטיקה שנשלחו לתיק (סימולציית WhatsApp)
  for (const n of [...notifications].reverse()) {
    const urlMatch = n.message.match(/(https?:\/\/\S+)/);
    const url = urlMatch?.[1];
    bubbles.push({
      id: `notif-${n.id}`,
      from: "bot",
      text: n.message,
      action: url
        ? {
            label: "פתח קישור",
            onClick: () => window.open(url, "_blank"),
          }
        : undefined,
    });
  }

  if (!started) {
    const startLabel =
      scenario === "existing_case"
        ? "המשך תהליך ההחזרה"
        : scenario === "existing_new_case"
          ? "פתיחת בקשת החזרה חדשה"
          : "התחלת תהליך החזרת ציוד";
    bubbles.push({
      id: "start-btn",
      from: "bot",
      action: { label: startLabel, onClick: handleStart },
    });
    return renderChat(caseData, bubbles, pendingHeaderSubtitle);
  }

  // 2. שלב פתיחת בקשה — מדלגים אם זה תיק קיים
  if (!skipIntake) {
    bubbles.push({
      id: "intake-ask",
      from: "bot",
      text:
        scenario === "existing_new_case"
          ? "מילאנו עבורך כמה פרטים ידועים — אנא ודא ועדכן במידת הצורך."
          : "לפני שמתחילים, נצטרך כמה פרטים בסיסיים על הבקשה.",
    });

    if (rejectedIntake) {
      bubbles.push({
        id: `intake-rej-${rejectedIntake.id}`,
        from: "bot",
        text: `הבקשה הקודמת לא אושרה${
          rejectedIntake.reviewNote ? ` (${rejectedIntake.reviewNote})` : ""
        }. ניתן לשלוח בקשה חדשה.`,
      });
    }

    if (!pendingIntake && !approvedIntake) {
      bubbles.push({
        id: "intake-form",
        from: "bot",
        customNode: (
          <IntakeForm
            caseData={caseData}
            defaults={defaults}
            onCaseCreated={onCaseCreated}
          />
        ),
      });
      return renderChat(caseData, bubbles, pendingHeaderSubtitle);
    }
  }

  // מעבר זה — תמיד יש intake submission, ולכן caseData חייב להתקיים
  if (!caseData) return renderChat(caseData, bubbles, pendingHeaderSubtitle);
  const c = caseData;

  if (pendingIntake && pendingIntake.payload.type === "intake_request") {
    const p = pendingIntake.payload;
    bubbles.push({
      id: `intake-user-${pendingIntake.id}`,
      from: "user",
      text: `שם: ${p.customerName}\nחברה: ${p.company}\nטלפון: ${p.phone}\nפרויקט: ${p.project}\nאתר: ${p.site}\nציוד: ${EQUIPMENT_LABELS[p.equipmentType]}${
        p.note ? `\nהערה: ${p.note}` : ""
      }`,
    });
    bubbles.push({
      id: "intake-pending",
      from: "bot",
      text: "הבקשה התקבלה. צוות S.B.A יבדוק את הפרטים וייצור איתך קשר להמשך התהליך.",
    });
    return renderChat(c, bubbles, pendingHeaderSubtitle);
  }

  // 3. אישור intake — מציגים סיכום ועוברים לחתימה
  if (approvedIntake && approvedIntake.payload.type === "intake_request") {
    bubbles.push({
      id: `intake-user-${approvedIntake.id}`,
      from: "user",
      text: `שם: ${approvedIntake.payload.customerName} · ${approvedIntake.payload.company}`,
    });
    bubbles.push({
      id: "intake-ok",
      from: "bot",
      text: "הבקשה אושרה ע״י צוות S.B.A. נמשיך בתהליך.",
    });
  }

  // 4. בקשת חתימה — רק אחרי אישור intake
  bubbles.push({
    id: "ask-sign",
    from: "bot",
    text: "כדי להתחיל בתהליך החזרת הציוד, יש לאשר תחילה את נוהל ההחזרות.",
  });

  if (!signSub) {
    bubbles.push({
      id: "sign-btn",
      from: "bot",
      action: {
        label: "חתימה על נוהל החזרות",
        onClick: () => openAction("sign_policy"),
      },
    });
    return renderChat(c, bubbles);
  }

  // 5. אישור חתימה
  if (signSub.payload.type === "sign_policy") {
    bubbles.push({
      id: "sign-user",
      from: "user",
      text: `חתמתי על הנוהל — ${signSub.payload.signerName}`,
    });
  }
  bubbles.push({
    id: "sign-ok",
    from: "bot",
    text: "תודה, החתימה התקבלה בהצלחה.\nכעת ניתן לבקש מועד החזרה.",
  });

  // 4. בקשת תיאום מועד
  if (rejectedSchedule) {
    bubbles.push({
      id: `sched-rej-${rejectedSchedule.id}`,
      from: "bot",
      text: `בקשת התיאום הקודמת לא אושרה${
        rejectedSchedule.reviewNote ? ` (${rejectedSchedule.reviewNote})` : ""
      }. ניתן לשלוח בקשה חדשה.`,
    });
  }

  if (!pendingSchedule && !approvedSchedule) {
    if (scenario === "existing_case" && hasConfirmedSchedule) {
      appendCancelSection(bubbles, {
        pendingCancel,
        approvedCancel,
        openAction,
      });
    } else {
      bubbles.push({
        id: "sched-btn",
        from: "bot",
        action: {
          label: "תיאום מועד החזרה",
          onClick: () => openAction("schedule"),
        },
      });
    }
    return renderChat(c, bubbles);
  }

  if (pendingSchedule && pendingSchedule.payload.type === "schedule") {
    const p = pendingSchedule.payload;
    bubbles.push({
      id: `sched-user-${pendingSchedule.id}`,
      from: "user",
      text: `ביקשתי מועדי החזרה:\n${formatScheduleSubmission(p)}`,
    });
    bubbles.push({
      id: "sched-pending-1",
      from: "bot",
      text: "הבקשה התקבלה ותועבר לבדיקה. צוות S.B.A יאשר את המועד בהמשך.",
    });
    bubbles.push({
      id: "sched-pending-2",
      from: "bot",
      text: "קיבלנו את בקשת התיאום שלך. לאחר אישור פנימי תקבל הודעת אישור.",
    });
    return renderChat(c, bubbles);
  }

  if (approvedSchedule && approvedSchedule.payload.type === "schedule") {
    const p = approvedSchedule.payload;
    const approvedSegments = getScheduleRequestSegments(p);
    bubbles.push({
      id: `sched-user-${approvedSchedule.id}`,
      from: "user",
      text: `ביקשתי מועדי החזרה:\n${formatScheduleSubmission(p)}`,
    });
    bubbles.push({
      id: "sched-approved",
      from: "bot",
      text: `נקבע מועד להחזרת הציוד:\n${approvedSegments
        .map((segment, index) => `משאית ${index + 1}: ${formatHebDate(segment.requestedDate)}`)
        .join("\n")}\nכתובת: ${c.site}`,
    });

    // 5. העלאת תעודת משלוח
    if (!uploadSub) {
      bubbles.push({
        id: "upload-ask",
        from: "bot",
        text: "לקראת ההחזרה, יש להעלות תעודת משלוח / החזרה.",
      });
      bubbles.push({
        id: "upload-btn",
        from: "bot",
        action: {
          label: "העלאת תעודת משלוח",
          onClick: () => openAction("upload_doc"),
        },
      });
    } else if (uploadSub.payload.type === "upload_doc") {
      bubbles.push({
        id: `upload-user-${uploadSub.id}`,
        from: "user",
        text: `העליתי: ${uploadSub.payload.title}`,
      });
      bubbles.push({
        id: "upload-ok",
        from: "bot",
        text: "תעודת המשלוח התקבלה ונשמרה בתיק ההחזרה.",
      });
    }
  }

  // 6. ביטול / שינוי תאריך — רק עבור לקוח קיים עם תיק קיים שכבר תואם
  if (scenario === "existing_case" && hasConfirmedSchedule) {
    appendCancelSection(bubbles, { pendingCancel, approvedCancel, rejectedCancel, openAction });
  }

  return renderChat(c, bubbles);
}

function appendCancelSection(
  bubbles: Bubble[],
  args: {
    pendingCancel?: CustomerSubmission;
    approvedCancel?: CustomerSubmission;
    rejectedCancel?: CustomerSubmission;
    openAction: (a: CustomerActionType) => void;
  },
) {
  const { pendingCancel, approvedCancel, rejectedCancel, openAction } = args;
  if (approvedCancel) {
    bubbles.push({
      id: "cancel-approved",
      from: "bot",
      text: "בקשת הביטול / שינוי המועד אושרה. ניצור איתך קשר להמשך.",
    });
    return;
  }
  if (pendingCancel && pendingCancel.payload.type === "cancel_request") {
    bubbles.push({
      id: `cancel-user-${pendingCancel.id}`,
      from: "user",
      text: `בקשת ביטול / שינוי תאריך:\n${pendingCancel.payload.reason}`,
    });
    bubbles.push({
      id: "cancel-pending",
      from: "bot",
      text: "הבקשה התקבלה ונבדקת על ידי הצוות.",
    });
    return;
  }
  if (rejectedCancel && rejectedCancel.payload.type === "cancel_request") {
    bubbles.push({
      id: `cancel-rej-${rejectedCancel.id}`,
      from: "bot",
      text: `בקשת הביטול / שינוי המועד לא אושרה${
        rejectedCancel.reviewNote ? ` (${rejectedCancel.reviewNote})` : ""
      }. ניתן לשלוח בקשה חדשה.`,
    });
  }
  bubbles.push({
    id: "cancel-ask",
    from: "bot",
    text: "אם יש צורך בביטול או שינוי מועד, ניתן לשלוח בקשה לבדיקה.",
  });
  bubbles.push({
    id: "cancel-btn",
    from: "bot",
    action: {
      label: "בקשת ביטול / שינוי תאריך",
      onClick: () => openAction("cancel_request"),
    },
  });
}

function renderChat(
  caseData: ReturnCase | undefined,
  bubbles: Bubble[],
  pendingSubtitle?: string,
) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-[oklch(0.35_0.08_150)] px-4 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 font-bold">
          ש
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">ש.ב.א. — בוט החזרות</span>
          <span className="text-[11px] opacity-80">
            {caseData ? caseData.customer : pendingSubtitle ?? "לקוח חדש"}
          </span>
        </div>
        <Badge
          variant="outline"
          className="ms-auto border-white/30 bg-white/10 text-[10px] text-white"
        >
          סימולציה בלבד
        </Badge>
      </div>

      <CardContent
        className="flex flex-col gap-2 p-4 min-h-[420px]"
        style={{ backgroundColor: "oklch(0.95 0.02 145)" }}
      >
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`flex ${b.from === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
                b.from === "user"
                  ? "bg-[oklch(0.92_0.08_145)]"
                  : "bg-white"
              }`}
            >
              {b.text && (
                <p className="whitespace-pre-line text-sm text-foreground">
                  {b.text}
                </p>
              )}
              {b.customNode}
              {b.action && (
                <Button
                  size="sm"
                  variant={b.text ? "outline" : "default"}
                  className={`gap-2 ${b.text ? "mt-2" : ""}`}
                  onClick={b.action.onClick}
                >
                  {b.action.label !== "התחלת תהליך החזרת ציוד" && (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  {b.action.label === "התחלת תהליך החזרת ציוד" && (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  {b.action.label}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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
  const initialEquipment: EquipmentType =
    defaults?.equipmentType ?? caseData?.equipmentType ?? "rental";
  const [customerName, setCustomerName] = useState(defaults?.customerName ?? "");
  const [company, setCompany] = useState(defaults?.company ?? caseData?.customer ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [project, setProject] = useState(defaults?.project ?? caseData?.project ?? "");
  const [site, setSite] = useState(defaults?.site ?? caseData?.site ?? "");
  const [equipmentType, setEquipmentType] =
    useState<EquipmentType>(initialEquipment);
  const [note, setNote] = useState("");

  const canSubmit =
    customerName.trim().length >= 2 &&
    company.trim().length >= 2 &&
    phone.trim().length >= 6 &&
    project.trim().length >= 2 &&
    site.trim().length >= 2;

  const submit = async () => {
    if (!canSubmit) return;
    // אם אין תיק קיים — יוצרים תיק "ראשוני" חדש שאליו תיקשר הבקשה
    const targetCaseId =
      caseData?.id ??
      (
        await casesAdapter.create({
          customer: company.trim(),
          project: project.trim(),
          site: site.trim(),
          equipmentType: equipmentType as EquipmentType,
        })
      ).id;
    // יצירת טוקן רק לצורך תיעוד פנימי — נצרך מיד עם שליחה
    const t = await customerLinksAdapter.createToken({
      caseId: targetCaseId,
      action: "intake_request",
      createdBy: "סימולציית בוט",
    });
    await customerLinksAdapter.addSubmission({
      token: t.token,
      caseId: targetCaseId,
      action: "intake_request",
      payload: {
        type: "intake_request",
        customerName: customerName.trim(),
        company: company.trim(),
        phone: phone.trim(),
        project: project.trim(),
        site: site.trim(),
        equipmentType,
        note: note.trim() || undefined,
      },
    });
    if (!caseData) {
      auditAdapter.log("create_case", {
        caseId: targetCaseId,
        detail: `נפתח אוטומטית מבקשת לקוח חדש (${company.trim()})`,
      });
    }
    auditAdapter.log("customer_link_created", {
      caseId: targetCaseId,
      detail: "בוט: בקשת החזרה חדשה",
    });
    toast.success("הבקשה נשלחה לבדיקה");
    onCaseCreated?.(targetCaseId);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ik-name" className="text-xs">שם מלא *</Label>
          <Input id="ik-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={60} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ik-co" className="text-xs">שם החברה *</Label>
          <Input id="ik-co" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ik-phone" className="text-xs">טלפון *</Label>
          <Input id="ik-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" />
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="ik-note" className="text-xs">הערה קצרה</Label>
          <Textarea id="ik-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
        </div>
      </div>
      <Button size="sm" onClick={submit} disabled={!canSubmit} className="gap-2 self-end">
        <Send className="h-3.5 w-3.5" />
        שליחת הבקשה
      </Button>
    </div>
  );
}
