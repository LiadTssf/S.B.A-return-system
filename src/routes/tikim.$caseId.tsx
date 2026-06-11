import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Pencil, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CaseForm } from "@/components/case-form";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { ScheduleCard } from "@/components/schedule-card";
import { NotificationsCard } from "@/components/notifications-card";
import { CustomerSubmissionsCard } from "@/components/customer-submissions-card";
import { DocumentsCard } from "@/components/documents-card";
import { ReminderDialog } from "@/components/reminder-dialog";
import { useCase } from "@/hooks/use-cases";
import { useRole } from "@/hooks/use-role";
import { casesAdapter, auditAdapter, type CaseInput } from "@/adapters";
import {
  EQUIPMENT_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type CaseStatus,
} from "@/lib/case-types";
import {
  can,
  CAN_CHANGE_STATUS,
  CAN_CLOSE_CASE,
  CAN_EDIT_CASE,
  CAN_CREATE_REMINDER,
} from "@/lib/permissions";
import { ACTION_LABELS, type AuditEntry } from "@/lib/audit-types";
import { toast } from "sonner";

const FOCUS_VALUES = ["submissions", "messages", "documents", "schedule"] as const;
type FocusValue = (typeof FOCUS_VALUES)[number];

const FOCUS_ANCHOR_ID: Record<FocusValue, string> = {
  submissions: "section-submissions",
  messages: "section-messages",
  documents: "section-documents",
  schedule: "section-schedule",
};

export const Route = createFileRoute("/tikim/$caseId")({
  validateSearch: (search: Record<string, unknown>): { focus?: FocusValue } => {
    const f = search.focus;
    return {
      focus:
        typeof f === "string" && (FOCUS_VALUES as readonly string[]).includes(f)
          ? (f as FocusValue)
          : undefined,
    };
  },
  head: ({ params }) => ({
    meta: [
      { title: `תיק ${params.caseId} — ש.ב.א.` },
      { name: "description", content: `תצוגת תיק החזרה ${params.caseId}` },
    ],
  }),
  component: CaseDetailPage,
});

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CaseDetailPage() {
  const { caseId } = useParams({ from: "/tikim/$caseId" });
  const { focus } = Route.useSearch();
  const c = useCase(caseId);
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [caseLog, setCaseLog] = useState<AuditEntry[]>([]);
  useEffect(() => {
    const refresh = () => {
      auditAdapter.listForCase(caseId).then(setCaseLog);
    };
    refresh();
    return auditAdapter.subscribe(refresh);
  }, [caseId]);

  useEffect(() => {
    if (!focus) return;
    const id = FOCUS_ANCHOR_ID[focus as FocusValue];
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary/60", "rounded-lg");
        window.setTimeout(
          () => el.classList.remove("ring-2", "ring-primary/60", "rounded-lg"),
          1800,
        );
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [focus, caseId]);

  if (!c) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 py-12 text-center">
        <h1 className="text-xl font-semibold">תיק לא נמצא</h1>
        <p className="text-sm text-muted-foreground">
          מספר התיק {caseId} אינו קיים במערכת.
        </p>
        <Button asChild variant="outline">
          <Link to="/tikim">חזרה לרשימת התיקים</Link>
        </Button>
      </div>
    );
  }

  const isClosed = c.status === "completed";
  const canEdit = can(role, CAN_EDIT_CASE) && !isClosed;
  const canStatus = can(role, CAN_CHANGE_STATUS) && !isClosed;
  const canClose = can(role, CAN_CLOSE_CASE) && !isClosed;
  const canRemind = can(role, CAN_CREATE_REMINDER) && !isClosed;

  const handleEdit = async (data: CaseInput) => {
    const before: CaseInput = {
      customer: c.customer,
      project: c.project,
      site: c.site,
      equipmentType: c.equipmentType,
    };
    await casesAdapter.update(c.id, data);
    const diff = casesAdapter.diff(before, data);
    auditAdapter.log("update_case", { caseId: c.id, detail: diff || "ללא שינויים" });
    setEditOpen(false);
    toast.success("פרטי התיק עודכנו");
  };

  const handleStatusChange = async (next: CaseStatus) => {
    if (next === c.status) return;
    const from = STATUS_LABELS[c.status];
    const to = STATUS_LABELS[next];
    await casesAdapter.setStatus(c.id, next);
    auditAdapter.log("update_case", { caseId: c.id, detail: `סטטוס: ${from} → ${to}` });
    toast.success(`הסטטוס עודכן ל-${to}`);
  };

  const handleClose = async () => {
    await casesAdapter.close(c.id);
    auditAdapter.log("close_case", { caseId: c.id, detail: `${c.customer} · ${c.project}` });
    setConfirmClose(false);
    toast.success(`התיק ${c.id} נסגר`);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1 -mr-2">
          <Link to="/tikim">
            <ArrowRight className="h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.id}</span>
          <h1 className="text-2xl font-bold sm:text-3xl">{c.customer}</h1>
          <p className="text-sm text-muted-foreground">{c.project} · {c.site}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRemind && <ReminderDialog caseId={c.id} />}
          <CaseStatusBadge status={c.status} />
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">פרטי התיק</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="h-3.5 w-3.5" />
              ערוך
            </Button>
          )}
          {isClosed && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              תיק סגור — לצפייה בלבד
            </span>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Field label="לקוח" value={c.customer} />
          <Field label="פרויקט" value={c.project} />
          <Field label="אתר" value={c.site} />
          <Field label="סוג ציוד" value={EQUIPMENT_LABELS[c.equipmentType]} />
          <Field label="נפתח" value={formatDateTime(c.createdAt)} />
          <Field label="ע״י" value={c.createdBy} />
          <Field label="עודכן" value={formatDateTime(c.updatedAt)} />
          {c.closedAt && <Field label="נסגר" value={formatDateTime(c.closedAt)} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">סטטוס התיק</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CaseStatusBadge status={c.status} />
            <span className="text-xs text-muted-foreground">
              לא ניתן לחזור מ"הושלם" לסטטוס פתוח.
            </span>
          </div>
          {canStatus ? (
            <Select value={c.status} onValueChange={(v) => handleStatusChange(v as CaseStatus)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">
              {isClosed ? "תיק סגור" : "אין הרשאה לשנות סטטוס"}
            </span>
          )}
        </CardContent>
      </Card>

      <div id="section-schedule" className="transition-shadow">
        <ScheduleCard caseId={c.id} caseStatus={c.status} />
      </div>

      <div id="section-messages" className="transition-shadow">
        <NotificationsCard caseData={c} />
      </div>

      <div id="section-submissions" className="transition-shadow">
        <CustomerSubmissionsCard caseId={c.id} />
      </div>

      <div id="section-documents" className="transition-shadow">
        <DocumentsCard caseId={c.id} isClosed={isClosed} caseCreatedBy={c.createdBy} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">היסטוריית תיק</CardTitle>
        </CardHeader>
        <CardContent>
          {caseLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נרשמו עדיין פעולות לתיק זה.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {caseLog.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{ACTION_LABELS[e.action]}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {formatDateTime(e.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{e.roleLabel}</span>
                    {e.detail && <span className="truncate">{e.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canClose && (
        <div className="flex justify-end">
          <Button variant="destructive" onClick={() => setConfirmClose(true)} className="min-h-11">
            סגירת תיק וסימון כמסוכם
          </Button>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>עריכת פרטי תיק</DialogTitle>
          </DialogHeader>
          <CaseForm
            initial={c}
            submitLabel="שמור שינויים"
            onCancel={() => setEditOpen(false)}
            onSubmit={handleEdit}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>סגירת תיק {c.id}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <span>פעולה זו תסמן את התיק כמסוכם ולא ניתן יהיה לערוך אותו. אישור הסגירה?</span>
                <span className="rounded-md border border-border bg-muted p-3 text-foreground">
                  <strong>{c.customer}</strong> · {c.project} · {c.site} · {EQUIPMENT_LABELS[c.equipmentType]}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose}>אשר וסגור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
