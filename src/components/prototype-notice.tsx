import { FlaskConical } from "lucide-react";

/**
 * באנר אחיד לסימון מודול אבטיפוס/סימולציה שעדיין אינו מחובר ל-Supabase.
 * מטרה: שלא יטעו ולא יחשבו שמודול mock הוא נתון תפעולי אמיתי (בהירות handoff).
 */
export function PrototypeNotice({
  title = "מודול אבטיפוס — לא מחובר ל-Supabase",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-accent/50 bg-accent/10 p-2.5 text-xs text-accent-foreground">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 leading-relaxed text-accent-foreground/90">{children}</div>}
      </div>
    </div>
  );
}
