import { Eye } from "lucide-react";
import { useRole } from "@/hooks/use-role";

/** באנר עליון דק שמופיע למשתמש במצב צפייה בלבד (מנהלת מפעל). */
export function ReadOnlyBanner() {
  const role = useRole();
  if (role !== "factory_manager") return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-accent/40 bg-accent/15 px-3 py-1.5 text-xs text-accent-foreground">
      <Eye className="h-3.5 w-3.5" />
      <span>מצב צפייה בלבד — מנהלת מפעל</span>
    </div>
  );
}