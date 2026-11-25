import { app } from "@spice-world/web/lib/elysia-server";
import { redirect } from "next/navigation";

import { ProductForm } from "./form";

export default async function ProductMainSlot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: categories } = await app.categories.get({
    query: { take: 100 },
  });

  if (slug === "new") {
    const firstCategory = categories?.[0];
    return (
      <ProductForm
        categories={categories ?? []}
        product={{
          id: "new",
          slug: "new",
          name: "new product",
          description: "",
          status: "DRAFT",
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          category: firstCategory
            ? {
                id: firstCategory.id,
                name: firstCategory.name,
                attributes: [],
              }
            : { id: "", name: "", attributes: [] },
          categoryId: firstCategory?.id ?? "",
          variants: [],
          images: [],
        }}
      />
    );
  }

  const { data: product } = await app.products.slug({ slug }).get();
  if (!product) {
    redirect("/products");
  }

  return <ProductForm categories={categories ?? []} product={product} />;
}
