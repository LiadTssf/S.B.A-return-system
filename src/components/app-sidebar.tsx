import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarClock,
  Search,
  Smartphone,
  Shield,
  Bell,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAllActionItems } from "@/hooks/use-action-items";

const mainItems = [
  { title: "דשבורד", url: "/", icon: LayoutDashboard },
  { title: "תיקי החזרה", url: "/tikim", icon: FolderOpen },
  { title: "התראות ופעולות", url: "/notifications", icon: Bell },
  { title: "תיאום החזרות", url: "/teum", icon: CalendarClock },
  { title: "חיפוש מתקדם", url: "/hipus", icon: Search },
  { title: "ממשק לקוח", url: "/lakoach", icon: Smartphone },
];

const systemItems = [
  { title: "יומן פעולות", url: "/audit", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });
  const items = useAllActionItems();
  const openCount = items.filter((i) => i.status === "open").length;

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="border-b-[3px] border-primary">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
            ש
            <span className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-sidebar" aria-hidden />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight text-sidebar-foreground">
                ש.ב.א.
              </span>
              <span className="text-xs text-sidebar-foreground/70 leading-tight">
                ניהול החזרות
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ראשי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary"
                  >
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-right">{item.title}</span>
                          {item.url === "/notifications" && openCount > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums">
                              {openCount}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>מערכת</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary"
                  >
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}