import {
  SidebarInset,
  SidebarProvider,
} from "@spice-world/ui/components/sidebar";
import { TooltipProvider } from "@spice-world/ui/components/tooltip";
import { defineRoute } from "@teyik0/furin";

import { AppSidebar } from "../../components/app-sidebar";
import { Toaster } from "../../components/toaster";
import { authClient } from "../../lib/api";

export const route = defineRoute("/(dashboard)")
  .config({ mode: "ssr" })
  .loader(async ({ cookie, headers, redirect }) => {
    const { data: session } = await authClient.getSession({
      fetchOptions: {
        headers: { cookie: headers.cookie ?? "" },
      },
    });
    if (session?.user.role !== "admin") {
      throw redirect("/signin");
    }
    const sidebarOpen = String(cookie.sidebar_state?.value) !== "false"; // shadcn's SidebarProvider persists its open state in this cookie.
    return { user: session.user, sidebarOpen };
  })
  .layout(({ children, sidebarOpen, user }) => (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <a
          className="focus:bg-background focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:ring-2"
          href="#content"
        >
          Skip to Content
        </a>

        <AppSidebar user={user} />

        <SidebarInset id="content">{children}</SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  ));
