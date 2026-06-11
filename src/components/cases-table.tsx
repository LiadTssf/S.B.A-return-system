import { Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { EQUIPMENT_LABELS, type ReturnCase } from "@/lib/case-types";
import { useOpenCountByCase } from "@/hooks/use-action-items";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

function AttentionDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground shadow-sm",
      )}
      aria-label={`${count} פעולות ממתינות`}
      title={`${count} פעולות ממתינות לטיפול`}
    >
      <Bell className="h-3 w-3" />
      {count}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function CasesTable({ cases }: { cases: ReturnCase[] }) {
  const openByCase = useOpenCountByCase();
  if (cases.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          לא נמצאו תיקים. פתחי תיק חדש כדי להתחיל.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {cases.map((c) => (
          <Link
            key={c.id}
            to="/tikim/$caseId"
            params={{ caseId: c.id }}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                    {c.id}
                  </span>
                  <div className="flex items-center gap-2">
                    <AttentionDot count={openByCase[c.id] ?? 0} />
                    <CaseStatusBadge status={c.status} />
                  </div>
                </div>
                <p className="font-semibold leading-tight">{c.customer}</p>
                <p className="text-sm text-muted-foreground">{c.project}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{c.site} · {EQUIPMENT_LABELS[c.equipmentType]}</span>
                  <span className="tabular-nums">{formatDate(c.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">מס׳ תיק</TableHead>
              <TableHead className="text-right">לקוח</TableHead>
              <TableHead className="text-right">פרויקט</TableHead>
              <TableHead className="text-right">אתר</TableHead>
              <TableHead className="text-right">סוג ציוד</TableHead>
              <TableHead className="text-right">סטטוס</TableHead>
              <TableHead className="text-right">עודכן</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.id} className="cursor-pointer">
                <TableCell className="font-mono tabular-nums">
                  <Link
                    to="/tikim/$caseId"
                    params={{ caseId: c.id }}
                    className="text-primary hover:underline"
                  >
                    {c.id}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {c.customer}
                    <AttentionDot count={openByCase[c.id] ?? 0} />
                  </span>
                </TableCell>
                <TableCell>{c.project}</TableCell>
                <TableCell>{c.site}</TableCell>
                <TableCell>{EQUIPMENT_LABELS[c.equipmentType]}</TableCell>
                <TableCell>
                  <CaseStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDate(c.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}