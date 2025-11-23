"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import { ProductModel } from "@spice-world/server/modules/products/model";
import type { TagModel } from "@spice-world/server/modules/tags/model";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import { Form, useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app } from "@spice-world/web/lib/elysia";
import { unknownError } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { currentProductAtom, newProductAtom } from "../store";
import { ProductFormDetails } from "./form-details";
import { ProductFormImages } from "./form-images";
import { ProductFormOrganization } from "./form-org";
import { ProductFormVariants } from "./form-variants";

const createProduct = async (values: ProductModel.postBody) => {
	const { data, error } = await app.products.post(values);

	if (error) {
		toast.error("Failed to create product");
		return null;
	}

	if (data) {
		toast.success("Product created successfully");
		return data;
	}

	return null;
};

const updateProduct = async (
	productId: string,
	values: ProductModel.postBody,
	initialVariants: ProductModel.getByIdResult["variants"],
) => {
	const currentVariants = values.variants;

	const arraysEqual = (a: string[], b: string[]) => {
		if (a.length !== b.length) return false;
		const sortedA = [...a].sort();
		const sortedB = [...b].sort();
		return sortedA.every((val, idx) => val === sortedB[idx]);
	};

	const hasVariantChanged = (
		current: (typeof currentVariants)[number],
		original: (typeof initialVariants)[number],
	) => {
		return (
			current.price !== original.price ||
			current.sku !== original.sku ||
			current.stock !== original.stock ||
			current.currency !== original.currency ||
			!arraysEqual(
				current.attributeValueIds,
				original.attributeValues.map((av) => av.id),
			)
		);
	};

	const variantOperations = {
		create: currentVariants
			.filter((v) => !("id" in v) || !v.id)
			.map((v) => ({
				price: v.price,
				sku: v.sku,
				stock: v.stock ?? 0,
				currency: v.currency ?? "EUR",
				attributeValueIds: v.attributeValueIds,
			})),
		update: currentVariants
			.filter((v) => {
				if (!("id" in v) || !v.id) return false;
				const original = initialVariants.find(
					(iv) => iv.id === (v as { id?: string }).id,
				);
				return original && hasVariantChanged(v, original);
			})
			.map((v) => ({
				id: (v as { id?: string }).id as string,
				price: v.price,
				sku: v.sku,
				stock: v.stock ?? 0,
				currency: v.currency ?? "EUR",
				attributeValueIds: v.attributeValueIds,
			})),
		delete: initialVariants
			.filter(
				(iv) =>
					!currentVariants.find(
						(cv) => "id" in cv && (cv as { id?: string }).id === iv.id,
					),
			)
			.map((v) => v.id),
	};

	const hasVariantOperations =
		variantOperations.create.length > 0 ||
		variantOperations.update.length > 0 ||
		variantOperations.delete.length > 0;

	const { data, error } = await app.products({ id: productId }).patch({
		name: values.name,
		description: values.description,
		status: values.status,
		categoryId: values.categoryId,
		...(hasVariantOperations && { variants: variantOperations }),
	});

	if (error) {
		toast.error("Failed to update product");
		return null;
	}

	if (data) {
		toast.success("Product updated successfully");
		return data;
	}

	return null;
};

export const ProductForm = ({
	product,
	categories,
	tags,
}: {
	product: ProductModel.getByIdResult;
	categories: CategoryModel.getResult;
	tags: TagModel.getResult;
}) => {
	const router = useRouter();
	const pathname = usePathname();
	const isNew = pathname.endsWith("new");

	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	useEffect(() => {
		setSidebarProduct({
			name: product.name,
			description: product.description,
			status: product.status,
			img: product.images[0]?.url ?? null,
			categoryId: product.categoryId,
			slug: product.slug,
		});
	});

	const form = useForm({
		schema: ProductModel.postBody,
		defaultValues: {
			name: product.name ?? "",
			description: product.description ?? "",
			status: product.status ?? "DRAFT",
			categoryId: product.categoryId || (categories[0]?.id ?? ""),
			tags: product.tags.map((t) => t.id),
			variants:
				product.variants.length > 0
					? product.variants.map((v) => ({
							id: v.id,
							price: v.price,
							sku: v.sku ?? undefined,
							stock: v.stock,
							currency: v.currency,
							attributeValueIds: v.attributeValues.map((av) => av.id),
						}))
					: [
							{
								price: 0,
								sku: "",
								stock: 0,
								currency: "EUR",
								attributeValueIds: [],
							},
						],
			images: [] as File[],
		},
		onSubmit: async (values) => {
			try {
				if (isNew) {
					const data = await createProduct(values);
					if (data) {
						router.push(`/dashboard/products/${data.slug}`);
					}
				} else {
					const data = await updateProduct(
						product.id,
						values,
						product.variants || [],
					);
					if (data) {
						router.push(`/dashboard/products/${data.slug}`);
					}
				}
			} catch (error: unknown) {
				unknownError(
					error,
					isNew ? "Failed to create product" : "Failed to update product",
				);
			}
		},
	});

	const hasStock = (form.store.state.values.variants?.[0]?.stock ?? 0) > 0;

	return (
		<Form
			form={form}
			className="mx-auto grid max-w-236 flex-1 auto-rows-max gap-4"
		>
			<div className="flex items-center gap-4">
				<Button variant="outline" size="icon" className="h-7 w-7" asChild>
					<Link href="/dashboard/products">
						<ChevronLeft className="h-4 w-4" />
						<span className="sr-only">Back</span>
					</Link>
				</Button>

				<h1 className="flex-1 shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight sm:grow-0 capitalize">
					{form.store.state.values.name}
				</h1>
				{hasStock ? (
					<Badge variant="outline" className="ml-auto sm:ml-0">
						In stock
					</Badge>
				) : (
					<Badge variant="destructive" className="ml-auto sm:ml-0">
						Out of stock
					</Badge>
				)}
				<div className="hidden items-center gap-2 md:ml-auto md:flex">
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => form.reset()}
					>
						Discard
					</Button>
					<form.SubmitButton size="sm">Save Product</form.SubmitButton>
				</div>
			</div>

			<div className="grid gap-4 w-full md:grid-cols-[1fr_250px] lg:grid-cols-3 lg:gap-12">
				<div className="grid auto-rows-max items-start gap-4 lg:col-span-2 lg:gap-8 min-w-xs">
					<ProductFormDetails form={form} isNew={isNew} />
					<ProductFormVariants form={form} />
				</div>
				<div className="grid auto-rows-max items-start gap-4 lg:gap-8 min-w-xs">
					<ProductFormOrganization
						form={form}
						isNew={isNew}
						initialCategories={categories}
						initialTags={tags}
					/>
					<ProductFormImages isNew={isNew} form={form} />
				</div>
			</div>

			<div className="flex items-center justify-center gap-2 md:hidden">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => form.reset()}
				>
					Discard
				</Button>
				<form.SubmitButton size="sm">Save Product</form.SubmitButton>
			</div>
		</Form>
	);
};
