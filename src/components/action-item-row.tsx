import { Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileUp,
  LinkIcon,
  ScrollText,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ACTION_ITEM_TYPE_LABELS,
  PRIORITY_LABELS,
  getFocusSectionForType,
  type ActionItem,
  type ActionItemPriority,
  type ActionItemType,
} from "@/lib/action-items-types";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<ActionItemType, typeof Bell> = {
  customer_schedule_request: CalendarClock,
  customer_cancel_request: XCircle,
  customer_document_uploaded: FileUp,
  customer_policy_signed: FileCheck2,
  customer_link_expired: LinkIcon,
  reminder_due: Bell,
  truck_return_today: Truck,
  truck_return_tomorrow: Truck,
  case_waiting_review: ScrollText,
};

function priorityChipClass(p: ActionItemPriority): string {
  switch (p) {
    case "urgent":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "high":
      return "bg-accent/15 text-accent-foreground border-accent/40";
    case "normal":
      return "bg-primary/10 text-primary border-primary/30";
    case "low":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  item: ActionItem;
  canHandle: boolean;
  canDismiss: boolean;
  onHandle?: (item: ActionItem) => void;
  onDismiss?: (item: ActionItem) => void;
  compact?: boolean;
}

export function ActionItemRow({
  item,
  canHandle,
  canDismiss,
  onHandle,
  onDismiss,
  compact = false,
}: Props) {
  const Icon = TYPE_ICONS[item.type] ?? Bell;
  const focus = getFocusSectionForType(item.type);
  const isOpen = item.status === "open";
  const isHandled = item.status === "handled";
  const isDismissed = item.status === "dismissed";
  const isCritical = item.priority === "urgent";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
        isOpen ? "border-border" : "border-border/60",
        isHandled && "bg-muted/30",
        isDismissed && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            isCritical
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
            !isOpen && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {ACTION_ITEM_TYPE_LABELS[item.type]}
            </span>
            <Badge
              variant="outline"
              className={cn("border text-[10px] font-medium", priorityChipClass(item.priority))}
            >
              {PRIORITY_LABELS[item.priority]}
            </Badge>
            {isHandled && (
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/10 text-[10px] text-primary"
              >
                <CheckCircle2 className="me-1 h-3 w-3" />
                טופל
              </Badge>
            )}
            {isDismissed && (
              <Badge variant="outline" className="text-[10px]">
                התעלמו
              </Badge>
            )}
          </div>
          <p
            className={cn(
              "mt-1 text-sm font-medium leading-snug text-foreground",
              !isOpen && "text-muted-foreground line-through decoration-muted-foreground/40",
            )}
          >
            {item.title}
          </p>
          {item.description && !compact && (
            <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-line">
              {item.description}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{item.returnCaseId}</span>
            {item.customer && <span>· {item.customer}</span>}
            {item.project && <span>· {item.project}</span>}
            <span className="tabular-nums">· {formatDateTime(item.createdAt)}</span>
            {item.dueAt && item.type === "reminder_due" && (
              <span className="tabular-nums">· יעד: {formatDateTime(item.dueAt)}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
        <Button asChild size="sm" variant="outline" className="gap-1">
          <Link
            to="/tikim/$caseId"
            params={{ caseId: item.returnCaseId }}
            search={{ focus }}
          >
            פתח תיק
          </Link>
        </Button>
        {isOpen && canHandle && onHandle && (
          <Button size="sm" onClick={() => onHandle(item)} className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            סמן כטופל
          </Button>
        )}
        {isOpen && canDismiss && !isCritical && onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDismiss(item)}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            התעלם
          </Button>
        )}
      </div>
    </div>
  );
}