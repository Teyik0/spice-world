import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@spice-world/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spice-world/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@spice-world/ui/components/sidebar";
import { Link, useNavigate, useRouter } from "@teyik0/furin/link";
import {
  BoxesIcon,
  ChartSplineIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";

import { authClient } from "../lib/api";
import { Logo } from "./logo";
import { useTheme } from "./theme";

// Each section joins this list when its pages are migrated.
const NAV = [
  { title: "Dashboard", to: "/", icon: ChartSplineIcon },
  { title: "Products", to: "/products", icon: BoxesIcon },
] as const;

export function AppSidebar({
  user,
}: {
  user: (typeof authClient.$Infer.Session)["user"];
}) {
  const [path] = useRouter().currentHref.split("?");
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />} size="lg">
              <Logo className="size-8! shrink-0" />
              <span className="grid leading-tight">
                <span className="truncate font-semibold">Spice World</span>
                <span className="text-muted-foreground truncate text-xs">
                  Back Office
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {NAV.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={
                    item.to === "/"
                      ? path === "/"
                      : path === item.to || path?.startsWith(`${item.to}/`)
                  }
                  render={<Link to={item.to} />}
                  tooltip={item.title}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage alt="" src={user.image ?? undefined} />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </span>
                <ChevronsUpDownIcon className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-56"
                side="right"
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      await authClient.signOut();
                      await navigate({ to: "/signin" });
                    }}
                  >
                    <LogOutIcon />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
