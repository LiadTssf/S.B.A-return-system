import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionItemRow } from "@/components/action-item-row";
import { useAllActionItems } from "@/hooks/use-action-items";
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS } from "@/lib/roles";
import {
  can,
  CAN_DISMISS_NOTIFICATION,
  CAN_HANDLE_NOTIFICATION,
  CAN_VIEW_NOTIFICATIONS,
} from "@/lib/permissions";
import { actionItemsAdapter, auditAdapter } from "@/adapters";
import { toast } from "sonner";
import type { ActionItem } from "@/lib/action-items-types";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "התראות ופעולות לטיפול — ש.ב.א." },
      {
        name: "description",
        content: "מרכז עבודה יומי של מתאמת ההחזרות: בקשות לקוח, החזרות משאית ותזכורות.",
      },
    ],
  }),
  component: NotificationsPage,
});

type TabKey = "open" | "handled" | "all";

function NotificationsPage() {
  const role = useRole();
  const items = useAllActionItems();
  const [tab, setTab] = useState<TabKey>("open");

  const canView = can(role, CAN_VIEW_NOTIFICATIONS);
  const canHandle = can(role, CAN_HANDLE_NOTIFICATION);
  const canDismissPerm = can(role, CAN_DISMISS_NOTIFICATION);

  const filtered = useMemo(() => {
    if (tab === "open") return items.filter((i) => i.status === "open");
    if (tab === "handled")
      return items.filter((i) => i.status === "handled" || i.status === "dismissed");
    return items;
  }, [items, tab]);

  const openCount = items.filter((i) => i.status === "open").length;
  const handledCount = items.filter(
    (i) => i.status === "handled" || i.status === "dismissed",
  ).length;

  if (!canView) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="p-6 text-center">
            <ShieldOff className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">אין הרשאה לצפייה בהתראות</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handle = async (item: ActionItem) => {
    await actionItemsAdapter.markHandled(item.id, ROLE_LABELS[role]);
    auditAdapter.log("action_item_handled", {
      caseId: item.returnCaseId,
      detail: item.title,
    });
    toast.success("סומן כטופל");
  };

  const dismiss = async (item: ActionItem) => {
    await actionItemsAdapter.markDismissed(item.id, ROLE_LABELS[role]);
    auditAdapter.log("action_item_dismissed", {
      caseId: item.returnCaseId,
      detail: item.title,
    });
    toast.success("ההתראה הוסרה מהתור");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">התראות ופעולות לטיפול</h1>
          <p className="text-sm text-muted-foreground">
            מרכז העבודה היומי — בקשות לקוח, החזרות משאית, תזכורות וקישורים שפג תוקפם.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="open">פתוחות ({openCount})</TabsTrigger>
          <TabsTrigger value="handled">טופלו ({handledCount})</TabsTrigger>
          <TabsTrigger value="all">הכל ({items.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === "open"
              ? "אין כרגע פעולות פתוחות לטיפול. עבודה נקייה!"
              : "אין רשומות בטאב זה."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              canHandle={canHandle}
              canDismiss={canDismissPerm}
              onHandle={handle}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
