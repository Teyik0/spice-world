import { app } from "@spice-world/web/lib/elysia";
import { redirect } from "next/navigation";
import { ProductForm } from "./form";

export default async function ProductMainSlot({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const { data: categories } = await app.categories.get();

	if (slug === "new") {
		const firstCategory = categories?.[0];
		return (
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
								attributes: [],
							}
						: { id: "", name: "", imageId: "", attributes: [] },
					categoryId: firstCategory?.id ?? "",
					variants: [],
					images: [],
				}}
				categories={categories ?? []}
			/>
		);
	}

	const { data: product } = await app.products.slug({ slug }).get();
	if (!product) redirect("/products");

	return <ProductForm product={product} categories={categories ?? []} />;
}
