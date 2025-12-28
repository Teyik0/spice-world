"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import { ProductModel } from "@spice-world/server/modules/products/model";
import { Form, useForm } from "@spice-world/web/components/tanstack-form";
import { Button } from "@spice-world/web/components/ui/button";
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
			_version: product.version,
			variants: {
				create: isNew
					? [
							{
								price: 0,
								sku: undefined,
								stock: 0,
								currency: "EUR",
								attributeValueIds: [],
							},
						]
					: undefined,
				update: !isNew
					? product.variants.map((v) => ({
							id: v.id,
							price: v.price,
							sku: v.sku ?? undefined,
							stock: v.stock,
							currency: v.currency,
							attributeValueIds: v.attributeValues.map((av) => av.id),
						}))
					: undefined,
				delete: undefined,
			},
			images: undefined,
			imagesOps: {
				create: undefined,
				update: undefined,
				delete: undefined,
			},
		},
		onSubmit: async (values) => {
			console.log("try submit with", values);
			try {
				let data: ProductModel.postResult | ProductModel.patchResult;
				if (isNew) {
					data = await handleCreate(values as ProductModel.postBody);
				} else {
					data = await handleUpdate(values as ProductModel.patchBody);
					form.setFieldValue("_version", data.version);
					form.setFieldValue("variants", {
						create: undefined,
						update: data.variants.map((v) => ({
							id: v.id,
							price: v.price,
							sku: v.sku ?? undefined,
							stock: v.stock,
							currency: v.currency,
							attributeValueIds: v.attributeValues.map((av) => av.id),
						})),
						delete: undefined,
					});
					form.setFieldValue("images", undefined);
					form.setFieldValue("imagesOps", {
						create: undefined,
						update: undefined,
						delete: undefined,
					});
				}
				setSidebarProduct({
					name: data.name,
					description: data.description,
					status: data.status,
					img: data.images.find((img) => img.isThumbnail)?.url ?? null,
					categoryId: data.categoryId,
					slug: data.slug,
				});

				if (data.slug !== product.slug) {
					router.push(`/dashboard/products/${data.slug}`);
				}
			} catch (error: unknown) {
				const err = unknownError(
					error,
					isNew ? "Failed to create product" : "Failed to update product",
				);
				toast.error(elysiaErrorToString(err));
			}
		},
		onSubmitInvalid({ value, formApi }) {
			toast.error("Invalid submit");
			console.info(value);
			// @ts-expect-error
			console.info("formapi", formApi.state);
		},
	});

	const handleCreate = async (values: ProductModel.postBody) => {
		const { data, error } = await app.products.post(values);
		if (error) {
			toast.error(
				`Failed to create product with error ${error.status}: ${elysiaErrorToString(error)}`,
			);
			throw error;
		}
		toast.success("Product created successfully");
		return data;
	};

	const handleUpdate = async (values: ProductModel.patchBody) => {
		const { data, error } = await app
			.products({ id: product.id })
			.patch(values);
		if (error) {
			toast.error(
				`Failed to update product with error ${error.status}: ${elysiaErrorToString(error)}`,
			);
			throw error;
		}
		toast.success("Product updated successfully");
		return data;
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
					<ProductFormImages
						isNew={isNew}
						form={form}
						existingImages={product.images}
					/>
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
