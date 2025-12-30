import { app } from "@spice-world/web/lib/elysia";
import { redirect } from "next/navigation";
import { ProductForm } from "./form";

export default async function ProductPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const [{ slug }, categoriesResponse] = await Promise.all([
		params,
		app.categories.get(),
	]);

	const categories = categoriesResponse.data ?? [];

	if (slug === "new") {
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
					category: categories[0]
						? {
								id: categories[0].id,
								name: categories[0].name,
								imageId: categories[0].imageId,
							}
						: { id: "", name: "", imageId: "" },
					categoryId: categories[0]?.id ?? "",
					variants: [],
					images: [],
				}}
				categories={categories}
			/>
		);
	}

	const { data: product } = await app.products.slug({ slug }).get();
	if (!product) redirect("/products");

	return <ProductForm product={product} categories={categories} />;
}
