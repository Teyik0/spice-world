import { app } from "@spice-world/web/lib/elysia";
import { redirect } from "next/navigation";
import { ProductForm } from "./form";

export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const [params, categoriesResponse] = await Promise.all([
		props.params,
		app.categories.get(),
	]);

	const categories = categoriesResponse.data ?? [];

	if (params.slug === "new") {
		return (
			<main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
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
			</main>
		);
	}

	const { data: product } = await app.products
		.slug({ slug: params.slug })
		.get();

	if (!product) redirect("/dashboard/products");
	return (
		<main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
			<ProductForm product={product} categories={categories} />
		</main>
	);
}
