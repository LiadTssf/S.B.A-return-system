import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/roles";

/** זהות העובד המחובר + יציאה. מחליף את בורר התפקידים (מצב פיתוח). */
export function UserMenu() {
  const { authEnabled, profile, signOut } = useAuth();
  if (!authEnabled) return null; // מצב mock — אין Auth

  return (
    <div className="flex items-center gap-2">
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-xs font-medium">{profile?.display_name || "—"}</span>
        <span className="text-[10px] text-muted-foreground">
          {profile ? ROLE_LABELS[profile.role] : ""}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut()}
        className="gap-1"
        title="התנתקות"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">יציאה</span>
      </Button>
    </div>
  );
}
