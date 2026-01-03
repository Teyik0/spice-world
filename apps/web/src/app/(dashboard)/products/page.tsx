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
import { PackageIcon } from "lucide-react";
import { ProductsSidebar } from "./products-sidebar";
import { productsSearchParamsCache } from "./search-params";

export const INITIAL_PAGE_SIZE = 25;

export function LayoutProducts({
	sidebar,
	product,
}: {
	sidebar: React.ReactNode;
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

				{product}
			</SidebarInset>

			<Sidebar
				side="right"
				className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
			>
				{sidebar}
			</Sidebar>
		</>
	);
}

export default async function ProductsPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}) {
	const params = productsSearchParamsCache.parse(await searchParams);
	const [{ data: products }, { data: categories }] = await Promise.all([
		app.products.get({
			query: {
				name: params.name || undefined,
				skip: 0,
				take: INITIAL_PAGE_SIZE,
				status: params.status ?? undefined,
				categories: params.categories ?? undefined,
				sortBy: params.sortBy,
				sortDir: params.sortDir,
			},
		}),
		app.categories.get(),
	]);

	return (
		<LayoutProducts
			sidebar={
				<ProductsSidebar
					initialProducts={products ?? []}
					categories={categories ?? []}
				/>
			}
			product={
				<div className="flex flex-col items-center justify-center text-muted-foreground h-full">
					<PackageIcon className="size-16 stroke-1" />
					<p className="text-lg">Select a product to edit</p>
				</div>
			}
		/>
	);
}
