import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type CaseStatus } from "@/lib/case-types";
import { cn } from "@/lib/utils";

const STYLES: Record<CaseStatus, string> = {
  open: "bg-primary/15 text-primary border-primary/30",
  coordinating: "bg-accent/20 text-accent-foreground border-accent/40",
  awaiting_return: "bg-muted text-foreground border-border",
  in_review: "bg-secondary text-secondary-foreground border-border",
  completed: "bg-primary text-primary-foreground border-primary",
  cancelled: "bg-destructive/15 text-destructive border-destructive/40",
};

export function CaseStatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}