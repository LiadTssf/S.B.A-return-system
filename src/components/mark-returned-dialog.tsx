import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string; // ISO yyyy-mm-dd
  onConfirm: (isoDate: string, displayDate: string) => void;
}

export function MarkReturnedDialog({ open, onOpenChange, defaultDate, onConfirm }: Props) {
  const [date, setDate] = useState<Date>(
    defaultDate ? new Date(defaultDate) : new Date(),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>סימון החזרת הציוד</DialogTitle>
          <DialogDescription>
            מהו תאריך ההחזרה בפועל? סטטוס התיק יעבור ל"בבדיקה".
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label>תאריך החזרה בפועל</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-start gap-2 text-right font-normal min-h-11"
              >
                <CalendarIcon className="h-4 w-4" />
                {format(date, "EEEE, d בMMMM yyyy", { locale: he })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                locale={he}
                dir="rtl"
                disabled={(d) => d > new Date()}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">
            ביטול
          </Button>
          <Button
            onClick={() =>
              onConfirm(
                date.toISOString().slice(0, 10),
                format(date, "dd.MM.yyyy"),
              )
            }
            className="min-h-11"
          >
            אישור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
