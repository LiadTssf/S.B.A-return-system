import { useEffect, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHANNEL_LABELS,
  type NotificationChannel,
} from "@/adapters";
import type { ReturnCase } from "@/lib/case-types";
import type { ReturnSchedule } from "@/lib/schedule-types";
import { getReturnWindow } from "@/lib/schedule-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData: ReturnCase;
  schedule?: ReturnSchedule;
  onSubmit: (input: {
    channel: NotificationChannel;
    toName: string;
    toContact: string;
    message: string;
  }) => void;
}

function buildTemplate(c: ReturnCase, s?: ReturnSchedule): string {
  const segments = s?.segments ?? [];
  let body: string;
  if (segments.length === 0) {
    body = "תאריך פינוי הציוד טרם נקבע.";
  } else if (segments.length === 1) {
    const seg = segments[0];
    const dateStr = seg.plannedDate
      ? (() => {
          const [y, m, d] = seg.plannedDate!.split("-").map(Number);
          return format(new Date(y, m - 1, d), "EEEE d.M.yyyy", { locale: he });
        })()
      : "תאריך טרם נקבע";
    const winLabel = seg.plannedDate ? getReturnWindow(seg.plannedDate) : null;
    const win = winLabel ? ` (${winLabel})` : "";
    const truckLine =
      seg.driverName || seg.truckId
        ? `\n${seg.driverName ? `נהג: ${seg.driverName}` : ""}${seg.driverName && seg.truckId ? ", " : ""}${seg.truckId ? `משאית: ${seg.truckId}` : ""}.`
        : "";
    body = `מתוכנן ל-${dateStr}${win}.${truckLine}`;
  } else {
    const lines = segments.map((seg, i) => {
      const dateStr = seg.plannedDate
        ? (() => {
            const [y, m, d] = seg.plannedDate!.split("-").map(Number);
            return format(new Date(y, m - 1, d), "EEEE d.M.yyyy", { locale: he });
          })()
        : "תאריך טרם נקבע";
      const winLabel = seg.plannedDate ? getReturnWindow(seg.plannedDate) : null;
      const win = winLabel ? ` (${winLabel})` : "";
      const truckBits = [
        seg.driverName ? `נהג: ${seg.driverName}` : null,
        seg.truckId ? `משאית: ${seg.truckId}` : null,
      ].filter(Boolean);
      const truckLine = truckBits.length ? ` — ${truckBits.join(", ")}` : "";
      return `${i + 1}. ${dateStr}${win}${truckLine}`;
    });
    body = `הפינוי יתבצע ב-${segments.length} משאיות במועדים הבאים:\n${lines.join("\n")}`;
  }
  return `שלום ${c.customer},
פינוי הציוד מהאתר "${c.project}" (${c.site}):
${body}
נשמח לאישורך. תיק ${c.id}.
— ש.ב.א.`;
}

export function SendNotificationDialog({
  open,
  onOpenChange,
  caseData,
  schedule,
  onSubmit,
}: Props) {
  const [channel, setChannel] = useState<NotificationChannel>("whatsapp");
  const [toName, setToName] = useState(caseData.customer);
  const [toContact, setToContact] = useState("");
  const [message, setMessage] = useState(buildTemplate(caseData, schedule));
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setToName(caseData.customer);
      setMessage(buildTemplate(caseData, schedule));
      setError("");
    }
  }, [open, caseData, schedule]);

  const handleSend = () => {
    if (!toContact.trim()) {
      setError(channel === "email" ? "יש להזין כתובת מייל" : "יש להזין מספר טלפון");
      return;
    }
    if (!message.trim()) {
      setError("ההודעה לא יכולה להיות ריקה");
      return;
    }
    onSubmit({
      channel,
      toName: toName.trim() || caseData.customer,
      toContact: toContact.trim(),
      message: message.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>שליחת הודעת תיאום ללקוח</DialogTitle>
          <DialogDescription>
            סימולציה — ההודעה תישמר בתיק וב-WhatsApp המדומה של הלקוח, ללא שליחה אמיתית.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>ערוץ</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as NotificationChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CHANNEL_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="toName">איש קשר</Label>
              <Input id="toName" value={toName} onChange={(e) => setToName(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="toContact">
              {channel === "email" ? "כתובת מייל" : "מספר טלפון"}
            </Label>
            <Input
              id="toContact"
              value={toContact}
              onChange={(e) => setToContact(e.target.value)}
              placeholder={channel === "email" ? "name@example.com" : "05X-XXXXXXX"}
              dir="ltr"
              className="text-right"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="msg">הודעה</Label>
            <Textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              ניתן לערוך את התבנית לפני שליחה.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">
            ביטול
          </Button>
          <Button onClick={handleSend} className="min-h-11">
            שליחה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
