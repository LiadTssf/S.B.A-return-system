import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EQUIPMENT_LABELS, type EquipmentType } from "@/lib/case-types";
import { casesAdapter, type CaseInput } from "@/adapters";

import { CaseStatusBadge } from "@/components/case-status-badge";

interface Props {
  initial?: Partial<CaseInput>;
  submitLabel: string;
  onSubmit: (data: CaseInput) => void;
  onCancel?: () => void;
}

export function CaseForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const isNew = !initial;
  const [customers, setCustomers] = useState<string[]>([]);
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    initial?.customer && customers.includes(initial.customer) ? "existing" : "new",
  );
  const [project, setProject] = useState(initial?.project ?? "");
  const [site, setSite] = useState(initial?.site ?? "");
  const [equipmentType, setEquipmentType] = useState<EquipmentType>(
    initial?.equipmentType ?? "rental",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    casesAdapter.listCustomers().then((list) => {
      setCustomers(list);
      if (initial?.customer && list.includes(initial.customer)) {
        setCustomerMode("existing");
      }
    });
  }, [initial?.customer]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!customer.trim()) e.customer = "שדה חובה";
    if (!project.trim()) e.project = "שדה חובה";
    if (!site.trim()) e.site = "שדה חובה";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onSubmit({
      customer: customer.trim(),
      project: project.trim(),
      site: site.trim(),
      equipmentType,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer">לקוח *</Label>
        {customers.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className={
                "rounded-md border px-2 py-1 " +
                (customerMode === "existing"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground")
              }
              onClick={() => {
                setCustomerMode("existing");
                setCustomer("");
              }}
            >
              בחירה מרשימה
            </button>
            <button
              type="button"
              className={
                "rounded-md border px-2 py-1 " +
                (customerMode === "new"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground")
              }
              onClick={() => {
                setCustomerMode("new");
                setCustomer("");
              }}
            >
              לקוח חדש
            </button>
          </div>
        )}
        {customerMode === "existing" && customers.length > 0 ? (
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger id="customer">
              <SelectValue placeholder="בחרי לקוח" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="שם הלקוח"
          />
        )}
        {errors.customer && <p className="text-xs text-destructive">{errors.customer}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project">פרויקט *</Label>
        <Input
          id="project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="שם הפרויקט"
        />
        {errors.project && <p className="text-xs text-destructive">{errors.project}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="site">אתר *</Label>
        <Input
          id="site"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          placeholder="עיר / מיקום האתר"
        />
        {errors.site && <p className="text-xs text-destructive">{errors.site}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="equipmentType">סוג ציוד *</Label>
        <Select
          value={equipmentType}
          onValueChange={(v) => setEquipmentType(v as EquipmentType)}
        >
          <SelectTrigger id="equipmentType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(EQUIPMENT_LABELS) as EquipmentType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {EQUIPMENT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>סטטוס התיק</Label>
        <div className="flex items-center gap-2">
          <CaseStatusBadge status="open" />
          <span className="text-xs text-muted-foreground">
            {isNew ? "יוגדר אוטומטית בעת הפתיחה" : "ניתן לעדכן בדף התיק"}
          </span>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="min-h-11">
            ביטול
          </Button>
        )}
        <Button type="submit" className="min-h-11">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
