import { type CSSProperties, component$, Slot } from "@qwik.dev/core";
import type { RequestHandler } from "@qwik.dev/router";
import { Separator } from "@qwik-ui/headless";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
	SIDEBAR_WIDTH,
	SIDEBAR_WIDTH_ICON,
	SidebarInset,
	SidebarTrigger,
	useSidebarProvider,
} from "@/components/ui/sidebar";
import { getBetterAuthCookie } from "@/lib/auth-client";
import { app } from "@/lib/elysia-treaty";

export const onGet: RequestHandler = async ({ cookie, redirect }) => {
	const { error } = await app.api["is-admin"].get({
		headers: {
			cookie: getBetterAuthCookie(cookie),
		},
	});
	if (error) {
		console.error("[ERROR - MIDDLEWARE AUTH] ->", error?.value);
		throw redirect(308, "/signin");
	}
};

export default component$(() => {
	useSidebarProvider({
		defaultOpen: true,
	});

	return (
		<div
			class="group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar"
			data-slot="sidebar-wrapper"
			style={
				{
					"--sidebar-width": SIDEBAR_WIDTH,
					"--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
				} as CSSProperties
			}
		>
			<AppSidebar />
			<SidebarInset>
				<header class="flex h-16 shrink-0 items-center gap-2">
					<div class="flex w-full items-center gap-2 px-4">
						<SidebarTrigger />
						<Separator class="mr-2 h-4" orientation="vertical" />
						<Breadcrumb.Root>
							<Breadcrumb.List>
								<Breadcrumb.Item class="hidden md:block">
									ESGI Main
								</Breadcrumb.Item>
								<Breadcrumb.Separator class="hidden md:block" />
								<Breadcrumb.Item>Test</Breadcrumb.Item>
							</Breadcrumb.List>
						</Breadcrumb.Root>
						{/* <ThemeSwitch /> */}
					</div>
				</header>
				<Slot />
			</SidebarInset>
		</div>
	);
});
