import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import ThreadSidebar from "../components/Sidebar";

const LEFT_PROJECTS_SIDEBAR_WIDTH_STORAGE_KEY = "chat_projects_sidebar_width";
const LEFT_PROJECTS_SIDEBAR_MIN_WIDTH = 15 * 16;
const LEFT_PROJECTS_SIDEBAR_MAX_WIDTH = 28 * 16;

function ChatRouteLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "open-settings") return;
      void navigate({
        to: "/settings",
        search: { tab: "appearance" },
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        side="left"
        collapsible="icon"
        className="border-r border-border bg-card text-foreground"
        resizable={{
          maxWidth: LEFT_PROJECTS_SIDEBAR_MAX_WIDTH,
          minWidth: LEFT_PROJECTS_SIDEBAR_MIN_WIDTH,
          storageKey: LEFT_PROJECTS_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      <DiffWorkerPoolProvider>
        <Outlet />
      </DiffWorkerPoolProvider>
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
