import { useState } from "react";
import { BellPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  REMINDER_TYPE_LABELS,
  remindersAdapter,
  auditAdapter,
  actionItemsAdapter,
  type ReminderType,
} from "@/adapters";
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS } from "@/lib/roles";
import { toast } from "sonner";

interface Props {
  caseId: string;
  trigger?: React.ReactNode;
}

function defaultDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function defaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

export function ReminderDialog({ caseId, trigger }: Props) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ReminderType>("customer_return_date");
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState(defaultTime());
  const [note, setNote] = useState("");

  const reset = () => {
    setTitle("");
    setType("customer_return_date");
    setDate(defaultDate());
    setTime(defaultTime());
    setNote("");
  };

  const submit = async () => {
    const finalTitle = title.trim() || REMINDER_TYPE_LABELS[type];
    const dueAt = `${date}T${time}:00`;
    await remindersAdapter.create({
      caseId,
      title: finalTitle,
      type,
      dueAt,
      note: note.trim() || undefined,
      createdBy: ROLE_LABELS[role],
    });
    auditAdapter.log("reminder_created", {
      caseId,
      detail: `${finalTitle} · יעד: ${new Date(dueAt).toLocaleString("he-IL")}`,
    });
    await actionItemsAdapter.sync();
    toast.success("תזכורת נשמרה");
    setOpen(false);
    reset();
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
          <BellPlus className="h-3.5 w-3.5" />
          תזכורת חדשה
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>תזכורת פנימית חדשה</DialogTitle>
            <DialogDescription>
              תזכורת פנימית למתאמת בלבד. לא נשלחת ללקוח ולא לערוץ חיצוני.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rem-type">סוג תזכורת</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReminderType)}>
                <SelectTrigger id="rem-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REMINDER_TYPE_LABELS) as ReminderType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {REMINDER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rem-title">כותרת (אופציונלי)</Label>
              <Input
                id="rem-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={REMINDER_TYPE_LABELS[type]}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rem-date">תאריך</Label>
                <Input
                  id="rem-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rem-time">שעה</Label>
                <Input
                  id="rem-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rem-note">הערה (אופציונלי)</Label>
              <Textarea
                id="rem-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="פרטים נוספים..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={submit}>שמור תזכורת</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
