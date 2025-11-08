"use client";

import {
	Boxes,
	BringToFront,
	ChartSpline,
	Command,
	UserCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ThemeToggle } from "@/components/theme-provider";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Session } from "@/lib/utils";
import { NavUser } from "./nav-user";

// This is sample data
const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "/dashboard",
			icon: ChartSpline,
			isActive: true,
		},
		{
			title: "Products",
			url: "/dashboard/products",
			icon: Boxes,
			isActive: false,
		},
		{
			title: "Users",
			url: "/dashboard/users",
			icon: UserCircle,
			isActive: false,
		},
		{
			title: "Orders",
			url: "/dashboard/orders",
			icon: BringToFront,
			isActive: false,
		},
	],
};

export function AppSidebar({
	login,
	children,
	...props
}: { login: Session } & { children: React.ReactNode } & React.ComponentProps<
		typeof Sidebar
	>) {
	const [activeItem, setActiveItem] = React.useState(data.navMain[0]);
	const router = useRouter();

	return (
		<Sidebar
			collapsible="icon"
			className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
			{...props}
		>
			<Sidebar
				collapsible="none"
				className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
			>
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
								<Link href="/">
									<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
										<Command className="size-4" />
									</div>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">Acme Inc</span>
										<span className="truncate text-xs">Enterprise</span>
									</div>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent className="px-1.5 md:px-0">
							<SidebarMenu>
								{data.navMain.map((item) => (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton
											tooltip={{
												children: item.title,
												hidden: false,
											}}
											isActive={activeItem?.title === item.title}
											className="px-2.5 md:px-2 cursor-pointer"
											onClick={() => {
												setActiveItem(item);
												router.push(item.url);
											}}
										>
											<item.icon />
											<span>{item.title}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<ThemeToggle />
					<NavUser login={login} />
				</SidebarFooter>
			</Sidebar>
			{children}
		</Sidebar>
	);
}
