import { app } from "@spice-world/web/lib/elysia";
import { Provider } from "jotai";
import type { SearchParams } from "nuqs/server";
import { INITIAL_PAGE_SIZE, productsSearchParamsCache } from "../search-params";
import { ProductsHydrator, ProductsSidebar } from "./products-sidebar";

export default async function ProductsSidebarSlot({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
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
		<Provider>
			<ProductsHydrator initialProducts={products ?? []} />
			<ProductsSidebar
				initialProducts={products ?? []}
				categories={categories ?? []}
			/>
		</Provider>
	);
}
