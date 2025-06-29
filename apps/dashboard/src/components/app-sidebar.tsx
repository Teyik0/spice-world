import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { LuCommand } from "@qwikest/icons/lucide";
import { NavMain } from "./nav-main";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "./ui/sidebar";

const data = {
	navMain: [
		{
			title: "Statistiques",
			url: "/",
		},
		{
			title: "Produits",
			url: "/products",
			items: [
				{
					title: "Créer",
					url: "/products/new",
				},
				{
					title: "Supprimer",
					url: "#",
					isActive: true,
				},
			],
		},
		{
			title: "Utilisateurs",
			url: "/users",
			items: [
				{
					title: "Créer",
					url: "/users/new",
				},
			],
		},
	],
};

export const AppSidebar = component$(() => {
	return (
		<Sidebar collapsible="offcanvas" side="left" variant="inset">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<Link href="/">
							<SidebarMenuButton class="cursor-pointer" size="lg">
								<span class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<LuCommand class="size-4" />
								</span>
								<span class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-semibold">Spice World</span>
									<span class="truncate text-xs">Admin - Dashboard</span>
								</span>
							</SidebarMenuButton>
						</Link>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup class="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Gérer</SidebarGroupLabel>
					<NavMain items={data.navMain} />
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton>Footer button</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
});
