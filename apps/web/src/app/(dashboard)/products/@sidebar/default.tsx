import { app } from "@spice-world/web/lib/elysia";
import type { SearchParams } from "nuqs/server";
import { productsSearchParamsCache } from "../search-params";
import { ProductsSidebar } from "./products-sidebar";

export const INITIAL_PAGE_SIZE = 25;

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
		<ProductsSidebar
			initialProducts={products ?? []}
			categories={categories ?? []}
		/>
	);
}
