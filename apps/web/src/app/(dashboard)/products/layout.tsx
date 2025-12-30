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

export default async function LayoutProducts({
	children,
	product,
}: {
	children: React.ReactNode;
	product: React.ReactNode;
}) {
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

				<section className="p-6">{product}</section>
			</SidebarInset>

			<Sidebar
				side="right"
				className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
			>
				{children}
			</Sidebar>
		</>
	);
}
