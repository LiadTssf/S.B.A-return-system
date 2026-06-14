import { useState } from "react";
import { MessageSquarePlus, Mail, MessageCircle, Smartphone, Link as LinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/use-role";
import { can, CAN_SEND_NOTIFICATION, CAN_CREATE_CUSTOMER_LINK } from "@/lib/permissions";
import {
  notificationsAdapter,
  auditAdapter,
  CHANNEL_LABELS,
  SUPABASE_ENABLED,
  type NotificationChannel,
} from "@/adapters";
import { PrototypeNotice } from "./prototype-notice";
import { useNotifications } from "@/hooks/use-notifications";
import { useSchedule } from "@/hooks/use-schedule";
import { toast } from "sonner";
import { SendNotificationDialog } from "./send-notification-dialog";
import { CustomerLinkDialog } from "./customer-link-dialog";
import type { ReturnCase } from "@/lib/case-types";

const ICONS: Record<NotificationChannel, typeof Mail> = {
  whatsapp: MessageCircle,
  sms: Smartphone,
  email: Mail,
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  caseData: ReturnCase;
  readOnly?: boolean;
}

export function NotificationsCard({ caseData, readOnly }: Props) {
  const role = useRole();
  const items = useNotifications(caseData.id);
  const schedule = useSchedule(caseData.id);
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const isClosed = caseData.status === "completed";
  const canSend = !readOnly && !isClosed && can(role, CAN_SEND_NOTIFICATION);
  const canCreateLink = !readOnly && !isClosed && can(role, CAN_CREATE_CUSTOMER_LINK);

  const handleSubmit = async (input: {
    channel: NotificationChannel;
    toName: string;
    toContact: string;
    message: string;
  }) => {
    await notificationsAdapter.add({
      caseId: caseData.id,
      ...input,
      sentBy: role,
    });
    auditAdapter.log("notification_sent", {
      caseId: caseData.id,
      detail: `נשלחה הודעת WhatsApp מדומה ללקוח · ${CHANNEL_LABELS[input.channel]} → ${input.toContact}`,
    });
    setOpen(false);
    toast.success("ההודעה נשלחה בסימולציה ונשמרה בתיק.");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">תקשורת עם הלקוח</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canCreateLink && (
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} className="gap-1">
              <LinkIcon className="h-3.5 w-3.5" />
              קישור ללקוח
            </Button>
          )}
          {canSend && (
            <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
              <MessageSquarePlus className="h-3.5 w-3.5" />
              שליחת הודעה
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {SUPABASE_ENABLED && (
          <PrototypeNotice title="תקשורת לקוח — סימולציה (לא מחובר ל-Supabase)">
            אין שליחת WhatsApp/SMS/Email אמיתית, וההודעות אינן נשמרות ב-Supabase.
            למימוש נדרש: ספק WhatsApp Business API (Epic 6) + טבלת הודעות.
          </PrototypeNotice>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            לא נשלחו עדיין הודעות ללקוח עבור תיק זה.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((n) => {
              const Icon = ICONS[n.channel];
              return (
                <li key={n.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {CHANNEL_LABELS[n.channel]}
                      <span className="text-muted-foreground">·</span>
                      <span dir="ltr">{n.toContact}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        נשלח בסימולציה
                      </Badge>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {formatDateTime(n.sentAt)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                    {n.message}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <SendNotificationDialog
        open={open}
        onOpenChange={setOpen}
        caseData={caseData}
        schedule={schedule}
        onSubmit={handleSubmit}
      />
      <CustomerLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        caseId={caseData.id}
        segments={schedule?.segments ?? []}
      />
    </Card>
  );
}
