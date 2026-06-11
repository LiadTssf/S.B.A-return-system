import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CasesTable } from "@/components/cases-table";
import { CaseForm } from "@/components/case-form";
import { useCases } from "@/hooks/use-cases";
import { useRole } from "@/hooks/use-role";
import { can, CAN_CREATE_CASE } from "@/lib/permissions";
import { casesAdapter, auditAdapter } from "@/adapters";
import { toast } from "sonner";

export const Route = createFileRoute("/tikim/")({
  head: () => ({
    meta: [
      { title: "תיקי החזרה — ש.ב.א." },
      { name: "description", content: "ניהול תיקי החזרה: פתיחה, שיוך, סטטוסים וסגירה." },
    ],
  }),
  component: CasesListPage,
});

function CasesListPage() {
  const cases = useCases();
  const role = useRole();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const canCreate = can(role, CAN_CREATE_CASE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) =>
      [c.id, c.customer, c.project, c.site].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [cases, query]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium text-accent">אפיק 2 · ניהול תיק החזרה</p>
        <h1 className="text-2xl font-bold sm:text-3xl">תיקי החזרה</h1>
        <p className="text-sm text-muted-foreground">
          רשימת כל תיקי ההחזרה במערכת. לחיצה על תיק תפתח את התצוגה המפורטת.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי מס׳ תיק, לקוח, פרויקט או אתר"
            className="pr-9"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)} className="min-h-11 gap-2">
            <Plus className="h-4 w-4" />
            תיק חדש
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        מציג {filtered.length} מתוך {cases.length} תיקים
      </p>

      <CasesTable cases={filtered} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>פתיחת תיק החזרה חדש</DialogTitle>
            <DialogDescription>
              מלאי את פרטי הלקוח, הפרויקט וסוג הציוד. התיק ייפתח בסטטוס "פתוח".
            </DialogDescription>
          </DialogHeader>
          <CaseForm
            submitLabel="פתח תיק"
            onCancel={() => setOpen(false)}
            onSubmit={async (data) => {
              const c = await casesAdapter.create(data);
              auditAdapter.log("create_case", {
                caseId: c.id,
                detail: `${c.customer} · ${c.project}`,
              });
              setOpen(false);
              toast.success(`נפתח תיק ${c.id}`);
              navigate({ to: "/tikim/$caseId", params: { caseId: c.id } });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
