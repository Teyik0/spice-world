import { app } from "@spice-world/web/lib/elysia";
import { ProductsSidebar } from "./products-sidebar";
import { productsSearchParamsCache } from "./search-params";

export default async function ProductsPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[]>>;
}) {
	const params = productsSearchParamsCache.parse(await searchParams);

	const [{ data: products }, { data: categories }] = await Promise.all([
		app.products.get({
			query: {
				name: params.name || undefined,
				skip: params.skip,
				take: params.take,
				status: params.status ?? undefined,
				categories: params.categories ?? undefined,
				sortBy: params.sortBy,
				sortDir: params.sortDir,
			},
		}),
		app.categories.get(),
	]);

	return (
		<ProductsSidebar products={products ?? []} categories={categories ?? []} />
	);
}
