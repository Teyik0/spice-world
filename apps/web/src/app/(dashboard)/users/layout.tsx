import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@spice-world/web/components/ui/breadcrumb";
import {
	Sidebar,
	SidebarInset,
	SidebarTrigger,
} from "@spice-world/web/components/ui/sidebar";
import { authClient } from "@spice-world/web/lib/utils";
import { headers } from "next/headers";
import { SidebarRight } from "./sidebar-right";

export default async function LayoutUsers({
	children,
}: {
	children: React.ReactNode;
}) {
	const h = await headers();
	const { data } = await authClient.admin.listUsers({
		query: {
			limit: 100,
			sortBy: "createdAt",
			sortDirection: "desc",
		},
		fetchOptions: {
			headers: h,
		},
	});

	const users =
		data?.users.map((user) => ({
			id: user.id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
			role: user.role ?? "user",
			banned: user.banned ?? false,
		})) ?? [];

	return (
		<>
			<SidebarInset>
				<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem className="hidden md:block">
								<BreadcrumbLink href="/">Spice World</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator className="hidden md:block" />
							<BreadcrumbItem>
								<BreadcrumbPage>Users</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
					<SidebarTrigger className="-mr-1 ml-auto rotate-180" />
				</header>

				<section className="p-6">{children}</section>
			</SidebarInset>

			<Sidebar
				side="right"
				className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
			>
				<SidebarRight users={users} />
			</Sidebar>
		</>
	);
}
