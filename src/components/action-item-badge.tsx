import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useOpenActionItemsForCase } from "@/hooks/use-action-items";
import {
  getFocusSectionForType,
  type ActionItemPriority,
} from "@/lib/action-items-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function priorityClass(p: ActionItemPriority): string {
  switch (p) {
    case "urgent":
      return "bg-destructive text-destructive-foreground";
    case "high":
      return "bg-accent text-accent-foreground";
    case "normal":
      return "bg-primary text-primary-foreground";
    case "low":
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Badge בסגנון unread של WhatsApp: עיגול עם מספר.
 * לחיצה מנווטת לתיק עם focus לסקציה המתאימה לפריט החשוב ביותר.
 */
export function ActionItemBadge({
  caseId,
  variant = "inline",
}: {
  caseId: string;
  variant?: "inline" | "row";
}) {
  const items = useOpenActionItemsForCase(caseId);
  if (items.length === 0) return null;
  const top = items[0];
  const focus = getFocusSectionForType(top.type);
  const tone = priorityClass(top.priority);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/tikim/$caseId"
            params={{ caseId }}
            search={{ focus }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none shadow-sm transition-transform hover:scale-105",
              tone,
              variant === "row" && "h-5 min-w-5 justify-center",
            )}
            aria-label={`${items.length} פעולות ממתינות בתיק ${caseId}`}
          >
            <Bell className="h-3 w-3" />
            <span>{items.length}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-right" dir="rtl">
          <p className="text-xs font-semibold">
            {items.length === 1 ? "פעולה ממתינה" : `${items.length} פעולות ממתינות`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{top.title}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** תווית טקסטואלית "דורש טיפול" — לשימוש בכרטיסי מובייל לצד ה-badge */
export function NeedsAttentionLabel({ caseId }: { caseId: string }) {
  const items = useOpenActionItemsForCase(caseId);
  if (items.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
      <Bell className="h-3 w-3" />
      דורש טיפול
    </span>
  );
}