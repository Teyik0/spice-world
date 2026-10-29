"use client";

import { ThemeToggle } from "@spice-world/web/components/theme-provider";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@spice-world/web/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@spice-world/web/components/ui/tooltip";
import type { Session } from "@spice-world/web/lib/utils";
import {
  BadgeCheck,
  Boxes,
  BringToFront,
  ChartSpline,
  Command,
  LogOut,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: ChartSpline,
  },
  {
    title: "Products",
    url: "/products",
    icon: Boxes,
  },
  {
    title: "Users",
    url: "/users",
    icon: UserCircle,
  },
  {
    title: "Orders",
    url: "/orders",
    icon: BringToFront,
  },
];

export function AppSidebar({ login }: { login: Session }) {
  const [activeItem, setActiveItem] = useState(navItems[0]);
  const router = useRouter();
  const nav = usePathname();

  useEffect(() => {
    const foundItem = navItems
      .slice(1)
      .find((item) => nav.startsWith(item.url));
    if (foundItem) {
      setActiveItem(foundItem);
    } else {
      setActiveItem(navItems[0]);
    }
  }, [nav]);

  return (
    <div className="flex min-h-svh">
      {/* Main navigation sidebar */}
      <aside className="bg-sidebar sticky top-0 flex h-svh w-12 flex-col border-r">
        {/* Header with logo */}
        <header className="p-2">
          <Link
            className="bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-opacity hover:opacity-90"
            href="/"
          >
            <Command className="h-5 w-5" />
          </Link>
        </header>

        {/* Navigation items */}
        <nav className="flex-1 py-4">
          <TooltipProvider>
            <ul className="flex flex-col gap-2 px-2">
              {navItems.map((item) => (
                <li key={item.title}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          className={`flex h-8 w-full items-center justify-center rounded-lg transition-colors cursor-pointer${
                            activeItem?.title === item.title
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                          }
												`}
                          onClick={() => {
                            setActiveItem(item);
                            router.push(item.url);
                          }}
                          type="button"
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="sr-only">{item.title}</span>
                        </button>
                      }
                    />
                    <TooltipContent side="right" sideOffset={4}>
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        </nav>
        <footer className="flex flex-col gap-2 p-2">
          <ThemeToggle />
          <NavUser login={login} />
        </footer>
      </aside>
    </div>
  );
}

export function NavUser({ login }: { login: Session }) {
  const { user } = login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full cursor-pointer items-center justify-center rounded-lg transition-colors"
            type="button"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage alt={user.name} src={user.image ?? undefined} />
              <AvatarFallback className="rounded-lg">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">User menu</span>
          </button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-lg"
        side="right"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage alt={user.name} src={user.image ?? undefined} />
                <AvatarFallback className="rounded-lg">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <BadgeCheck />
              Account
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
