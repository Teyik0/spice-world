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
import { app } from "@spice-world/web/lib/elysia";
import { SidebarRight } from "./sidebar-right";

export default async function LayoutProducts({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: products } = await app.products.get({
		query: { take: 100, skip: 0, status: undefined },
	});

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
								<BreadcrumbPage>Products</BreadcrumbPage>
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
				<SidebarRight products={products ?? []} />
			</Sidebar>
		</>
	);
}
