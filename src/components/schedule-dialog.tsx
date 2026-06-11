import { useEffect, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon, AlertCircle } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAX_RETURNS_PER_DAY,
  getReturnWindow,
  isReturnableDate,
  toLocalIsoDate,
  type ScheduleSegment,
} from "@/lib/schedule-types";
import { scheduleAdapter } from "@/adapters";

export type ScheduleDialogMode = "date" | "truck";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ScheduleDialogMode;
  /** סגמנט קיים לעריכה; אם אין — מוסיפים סגמנט חדש (רק במצב "date") */
  segment?: ScheduleSegment;
  /** מספר סגמנט להצגה בכותרת (1-based) */
  segmentIndex?: number;
  caseId: string;
  onSubmit: (
    patch: Partial<Omit<ScheduleSegment, "id">>,
    summary: string,
    options: { dateChanged: boolean; isNew: boolean },
  ) => void;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  segment,
  segmentIndex,
  caseId,
  onSubmit,
}: Props) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [truckPlate, setTruckPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [error, setError] = useState<string>("");

  // איפוס ערכים בכל פתיחה
  useEffect(() => {
    if (!open) return;
    setDate(
      segment?.plannedDate
        ? (() => {
            const [y, m, d] = segment.plannedDate!.split("-").map(Number);
            return new Date(y, m - 1, d);
          })()
        : undefined,
    );
    setNotes(segment?.notes ?? "");
    setTruckPlate(segment?.truckId ?? "");
    setDriverName(segment?.driverName ?? "");
    setDriverPhone(segment?.driverPhone ?? "");
    setError("");
  }, [open, segment]);

  const [isDayFull, setIsDayFull] = useState(false);
  useEffect(() => {
    if (!date) {
      setIsDayFull(false);
      return;
    }
    const iso = toLocalIsoDate(date);
    scheduleAdapter
      .countOnDate(iso, segment?.id)
      .then((count) => setIsDayFull(count >= MAX_RETURNS_PER_DAY));
  }, [date, segment?.id]);

  const window = date ? getReturnWindow(toLocalIsoDate(date)) : null;
  const isNew = !segment;

  const handleSubmit = () => {
    if (mode === "date") {
      if (!date) {
        setError("יש לבחור תאריך");
        return;
      }
      if (!isReturnableDate(date)) {
        setError("לא ניתן לתאם החזרה בימי שישי או שבת");
        return;
      }
      const iso = toLocalIsoDate(date);
      const win = getReturnWindow(iso);
      const dateChanged = !!segment?.plannedDate && segment.plannedDate !== iso;
      onSubmit(
        { plannedDate: iso, notes: notes.trim() || undefined },
        `${format(date, "dd.MM.yyyy")}${win ? ` · ${win}` : ""}`,
        { dateChanged, isNew },
      );
    } else {
      if (!driverName.trim()) {
        setError("יש להזין שם נהג");
        return;
      }
      if (!driverPhone.trim()) {
        setError("יש להזין טלפון נהג");
        return;
      }
      onSubmit(
        {
          truckId: truckPlate.trim() || undefined,
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
        },
        `נהג ${driverName.trim()}${truckPlate.trim() ? ` · משאית ${truckPlate.trim()}` : ""}`,
        { dateChanged: false, isNew: false },
      );
    }
  };

  const segLabel = segmentIndex ? ` · משאית ${segmentIndex}` : "";
  const title =
    mode === "date"
      ? isNew
        ? `הוספת משאית חדשה — תאריך החזרה`
        : `עדכון תאריך החזרה${segLabel}`
      : `פרטי נהג ומשאית${segLabel}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "date"
              ? isNew
                ? "הוספת משאית נוספת לתיק זה — בחרי תאריך נפרד. ניתן לתאם מספר משאיות בתאריכים שונים לאותה החזרה."
                : "בחרי תאריך מתוכנן. חלון השעות נקבע אוטומטית לפי היום בשבוע."
              : "הזיני את פרטי הנהג למשאית זו בלבד."}
          </DialogDescription>
        </DialogHeader>

        {mode === "date" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>תאריך מתוכנן *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start gap-2 text-right font-normal min-h-11",
                      !date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {date ? format(date, "EEEE, d בMMMM yyyy", { locale: he }) : "בחרי תאריך"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setError("");
                    }}
                    disabled={(d) => {
                      if (!isReturnableDate(d)) return true;
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (d < today) return true;
                      return false;
                    }}
                    initialFocus
                    locale={he}
                    dir="rtl"
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                ימי החזרה: א'-ד' 09:00–14:00 · ה' 09:00–13:00 · ו'-ש' סגור · עד {MAX_RETURNS_PER_DAY} החזרות ביום
              </p>
            </div>

            {date && window && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">חלון שעות החזרה: </span>
                <span className="font-medium" dir="ltr">{window}</span>
              </div>
            )}

            {isDayFull && (
              <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  היום עמוס — כבר מתוזמנות {MAX_RETURNS_PER_DAY} החזרות ביום זה. ניתן להמשיך ולשמור (חריגה מותרת מצד החברה), אך מומלץ לוודא עומס מול הלוגיסטיקה.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">הערות לתיאום</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="למשל: ליצור קשר טלפוני לפני הגעה"
                rows={3}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="driverName">שם הנהג *</Label>
              <Input
                id="driverName"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="שם מלא של הנהג להחזרה זו"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="driverPhone">טלפון הנהג *</Label>
              <Input
                id="driverPhone"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="05X-XXXXXXX"
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="truckPlate">מספר רישוי משאית (אופציונלי)</Label>
              <Input
                id="truckPlate"
                value={truckPlate}
                onChange={(e) => setTruckPlate(e.target.value)}
                placeholder="למשל 47-123-89"
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">
            ביטול
          </Button>
          <Button onClick={handleSubmit} className="min-h-11">
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
