import { redirect } from "next/navigation";
import { newProductDefault } from "@/lib/product";
import { app } from "@/lib/utils";
import { ProductForm } from "./product-form";

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
				<ProductForm product={newProductDefault} categories={categories} />
			</main>
		);
	}

	const product = undefined;
	if (!product) redirect("/dashboard/products");
	return (
		<main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
			here
		</main>
	);
}
