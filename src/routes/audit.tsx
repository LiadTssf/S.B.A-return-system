import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { auditAdapter } from "@/adapters";
import { ACTION_LABELS, type AuditEntry } from "@/lib/audit-types";
import { getActiveRole, ROLE_LABELS } from "@/lib/roles";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "יומן פעולות — ש.ב.א." },
      { name: "description", content: "תיעוד פעולות במערכת לפי משתמש, תאריך וסוג פעולה." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    auditAdapter.list().then(setEntries);
    setRole(ROLE_LABELS[getActiveRole()]);
  }, []);

  const allowed = role !== ROLE_LABELS["external_client"];

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">אין הרשאה לצפייה ב-Audit Log</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">יומן פעולות</h1>
          <p className="text-sm text-muted-foreground">
            תיעוד אוטומטי של כל פעולה — לא ניתן למחיקה ע"י משתמשי קצה.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              אין רשומות עדיין. פעולות במערכת יתועדו כאן אוטומטית.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead className="bg-muted text-xs">
                  <tr className="text-right">
                    <th className="p-3 font-medium">תאריך ושעה</th>
                    <th className="p-3 font-medium">משתמש</th>
                    <th className="p-3 font-medium">פעולה</th>
                    <th className="p-3 font-medium">תיק</th>
                    <th className="p-3 font-medium">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.timestamp).toLocaleString("he-IL")}
                      </td>
                      <td className="p-3">{e.roleLabel}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {ACTION_LABELS[e.action]}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {e.caseId ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{e.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
