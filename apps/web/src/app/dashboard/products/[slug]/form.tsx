"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import { ProductModel } from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/web/components/ui/button";
import { Form, useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { unknownError } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { currentProductAtom, newProductAtom } from "../store";
import { ProductFormClassification } from "./form-classification";
import { ProductFormDetails } from "./form-details";
import { ProductFormImages } from "./form-images";
import { ProductFormVariants } from "./form-variants";

export const ProductForm = ({
	product,
	categories,
}: {
	product: ProductModel.getByIdResult;
	categories: CategoryModel.getResult;
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
			img: product.images.find((img) => img.isThumbnail)?.url ?? null,
			categoryId: product.categoryId,
			slug: product.slug,
		});
	});

	const form = useForm({
		schema: isNew ? ProductModel.postBody : ProductModel.patchBody,
		defaultValues: {
			name: product.name,
			description: product.description,
			status: product.status,
			categoryId: product.categoryId,
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
			console.log("try submit with", values);
			try {
				if (isNew) {
					await handleCreate(values as ProductModel.postBody);
				} else {
					await handleUpdate(values as ProductModel.patchBody);
				}
			} catch (error: unknown) {
				const err = unknownError(
					error,
					isNew ? "Failed to create product" : "Failed to update product",
				);
				toast.error(elysiaErrorToString(err));
			}
		},
	});

	const handleCreate = async (values: ProductModel.postBody) => {
		const { data, error } = await app.products.post(values);
		if (error) {
			toast.error(
				`Failed to create product with error ${error.status}: ${elysiaErrorToString(error)}`,
			);
			return;
		}
		toast.success("Product created successfully");
		router.push(`/dashboard/products/${data.slug}`);
	};

	const handleUpdate = async (_: ProductModel.patchBody) => {
		// router.push(`/dashboard/products/${data.slug}`);
	};

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
				{/*{hasStock ? (
					<Badge variant="outline" className="ml-auto sm:ml-0">
						In stock
					</Badge>
				) : (
					<Badge variant="destructive" className="ml-auto sm:ml-0">
						Out of stock
					</Badge>
				)}*/}
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
					<ProductFormClassification
						form={form}
						isNew={isNew}
						initialCategories={categories}
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
