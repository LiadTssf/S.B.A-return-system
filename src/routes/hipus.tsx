import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, X, FileText, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CaseStatusBadge } from "@/components/case-status-badge";
import {
  EQUIPMENT_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type CaseStatus,
  type EquipmentType,
} from "@/lib/case-types";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/document-types";
import { searchAdapter, EMPTY_FILTERS, type SearchFilters, type SearchHit } from "@/adapters";
import { useCases } from "@/hooks/use-cases";

export const Route = createFileRoute("/hipus")({
  head: () => ({
    meta: [
      { title: "חיפוש מתקדם — ש.ב.א." },
      { name: "description", content: "חיפוש תיקי החזרה לפי לקוח, פרויקט, אתר, תאריך וכותרת מסמך." },
    ],
  }),
  component: SearchPage,
});

const EQUIPMENT_OPTIONS: EquipmentType[] = ["rental", "customer_owned", "rental_and_customer"];

function SearchPage() {
  // ensures store is seeded; also re-renders on data changes
  useCases();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);

  const [results, setResults] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (!mounted) return;
    searchAdapter.search(filters).then(setResults);
  }, [filters, mounted]);

  const hasAnyFilter =
    filters.q.trim() !== "" ||
    filters.statuses.length > 0 ||
    filters.equipmentTypes.length > 0 ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    filters.openTrucksOnly ||
    filters.pendingCustomerConfirmation ||
    filters.noReturnCertificate;

  const toggleStatus = (s: CaseStatus) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));

  const toggleEquipment = (e: EquipmentType) =>
    setFilters((f) => ({
      ...f,
      equipmentTypes: f.equipmentTypes.includes(e)
        ? f.equipmentTypes.filter((x) => x !== e)
        : [...f.equipmentTypes, e],
    }));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">חיפוש מתקדם</h1>
        <p className="text-sm text-muted-foreground">
          חיפוש תיקים לפי לקוח, פרויקט, אתר, וכותרות מסמכים ותמונות.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">פילטרים</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search-q">חיפוש חופשי</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-q"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="לקוח, פרויקט, אתר, מס׳ תיק או כותרת מסמך/תמונה"
                className="pr-10"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>סטטוס</Label>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((s) => {
                  const active = filters.statuses.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStatus(s)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>סוג ציוד</Label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((e) => {
                  const active = filters.equipmentTypes.includes(e);
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => toggleEquipment(e)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {EQUIPMENT_LABELS[e]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-from">מתאריך החזרה</Label>
              <Input
                id="date-from"
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-to">עד תאריך החזרה</Label>
              <Input
                id="date-to"
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>מסננים מיוחדים</Label>
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.openTrucksOnly}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, openTrucksOnly: v === true }))
                  }
                />
                רק תיקים עם משאיות פתוחות
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.pendingCustomerConfirmation}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, pendingCustomerConfirmation: v === true }))
                  }
                />
                ממתינים לאישור לקוח
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.noReturnCertificate}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, noReturnCertificate: v === true }))
                  }
                />
                משאיות שהוחזרו ללא תעודת החזרה
              </label>
            </div>
          </div>

          {hasAnyFilter && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                נקה פילטרים
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          נמצאו <span className="font-semibold text-foreground">{results.length}</span> תיקים
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {results.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              לא נמצאו תיקים תואמים. נסי לשנות את הפילטרים.
            </CardContent>
          </Card>
        )}

        {results.map((hit) => (
          <Link
            key={hit.case.id}
            to="/tikim/$caseId"
            params={{ caseId: hit.case.id }}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {hit.case.id}
                    </span>
                    <CaseStatusBadge status={hit.case.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {EQUIPMENT_LABELS[hit.case.equipmentType]}
                  </span>
                </div>

                <div>
                  <p className="font-semibold leading-tight">{hit.case.customer}</p>
                  <p className="text-sm text-muted-foreground">
                    {hit.case.project} · {hit.case.site}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    {hit.segmentsCount} משאיות
                    {hit.openSegmentsCount > 0 && (
                      <span className="text-foreground">
                        ({hit.openSegmentsCount} פתוחות)
                      </span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {hit.documents.length} קבצים
                  </span>
                </div>

                {hit.matchedFields.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {hit.matchedFields.map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px]">
                        התאמה: {m}
                      </Badge>
                    ))}
                  </div>
                )}

                {hit.matchedDocuments.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      קבצים תואמים:
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {hit.matchedDocuments.slice(0, 3).map((d) => (
                        <li key={d.id} className="text-xs">
                          <span className="font-medium">{d.title}</span>
                          <span className="text-muted-foreground">
                            {" · "}
                            {DOCUMENT_CATEGORY_LABELS[d.category]}
                          </span>
                        </li>
                      ))}
                      {hit.matchedDocuments.length > 3 && (
                        <li className="text-xs text-muted-foreground">
                          ועוד {hit.matchedDocuments.length - 3}…
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
