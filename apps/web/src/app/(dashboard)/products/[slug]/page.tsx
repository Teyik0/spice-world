import { app } from "@spice-world/web/lib/elysia";
import { redirect } from "next/navigation";
import { INITIAL_PAGE_SIZE, LayoutProducts } from "../page";
import { ProductsSidebar } from "../products-sidebar";
import { productsSearchParamsCache } from "../search-params";
import { ProductForm } from "./form";

export default async function ProductPage({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string>>;
}) {
	const queryParams = productsSearchParamsCache.parse(await searchParams);
	const [{ slug }, { data: products }, { data: categories }] =
		await Promise.all([
			params,
			app.products.get({
				query: {
					name: queryParams.name || undefined,
					skip: 0,
					take: INITIAL_PAGE_SIZE,
					status: queryParams.status ?? undefined,
					categories: queryParams.categories ?? undefined,
					sortBy: queryParams.sortBy,
					sortDir: queryParams.sortDir,
				},
			}),
			app.categories.get(),
		]);

	const firstCategory = categories?.[0];

	if (slug === "new") {
		// Parallel routes don't support revalidatePath & layout can't pass searchParams.
		return (
			<LayoutProducts
				sidebar={
					<ProductsSidebar
						initialProducts={products ?? []}
						categories={categories ?? []}
					/>
				}
				product={
					<ProductForm
						product={{
							id: "new",
							slug: "new",
							name: "new product",
							description: "",
							status: "DRAFT",
							createdAt: new Date(),
							updatedAt: new Date(),
							version: 0,
							category: firstCategory
								? {
										id: firstCategory.id,
										name: firstCategory.name,
										imageId: firstCategory.imageId,
									}
								: { id: "", name: "", imageId: "" },
							categoryId: firstCategory?.id ?? "",
							variants: [],
							images: [],
						}}
						categories={categories ?? []}
					/>
				}
			/>
		);
	}

	const { data: product } = await app.products.slug({ slug }).get();
	if (!product) redirect("/products");

	// Parallel routes don't support revalidatePath & layout can't pass searchParams.
	return (
		<LayoutProducts
			sidebar={
				<ProductsSidebar
					initialProducts={products ?? []}
					categories={categories ?? []}
				/>
			}
			product={<ProductForm product={product} categories={categories ?? []} />}
		/>
	);
}
