"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import { ProductModel } from "@spice-world/server/modules/products/model";
import { Form, useForm } from "@spice-world/web/components/tanstack-form";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@spice-world/web/components/ui/dialog";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { unknownError } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { currentProductAtom, newProductAtom } from "../../store";
import { ProductFormClassification } from "./form-classification";
import { ProductFormDetails } from "./form-details";
import { ProductFormImages } from "./form-images";
import { ProductFormVariants } from "./form-variants";

interface AttributeValueInfo {
	attributeId: string;
	values: string[];
}

export const ProductForm = ({
	product,
	categories,
}: {
	product: ProductModel.getByIdResult;
	categories: CategoryModel.getResult;
}) => {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isNew = pathname.endsWith("new");
	const queryString = searchParams.toString();

	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const [formResetKey, setFormResetKey] = useState(0);
	const [showCategoryWarning, setShowCategoryWarning] = useState(false);
	const [attributesToRemove, setAttributesToRemove] = useState<
		AttributeValueInfo[]
	>([]);

	const handleDiscard = () => {
		form.reset();
		setFormResetKey((k) => k + 1);
	};

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

	const getAttributesToRemove = (): AttributeValueInfo[] => {
		const attributeMap = new Map<string, Set<string>>();

		for (const variant of product.variants) {
			for (const attrValue of variant.attributeValues) {
				const attrId = attrValue.attributeId;
				if (!attributeMap.has(attrId)) {
					attributeMap.set(attrId, new Set());
				}
				attributeMap.get(attrId)?.add(attrValue.value);
			}
		}

		return Array.from(attributeMap.entries()).map(([attributeId, values]) => ({
			attributeId,
			values: Array.from(values),
		}));
	};

	const hasCategoryChanged = () => {
		const currentCategoryId = form.getFieldValue("categoryId");
		return currentCategoryId !== product.categoryId;
	};

	const hasExistingAttributeValues = () => {
		return product.variants.some(
			(v) => v.attributeValues && v.attributeValues.length > 0,
		);
	};

	const executeSubmit = async () => {
		const values = form.store.state.values;
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
			setSidebarProduct(null);

			if (data.slug !== product.slug) {
				router.push(
					`/products/${data.slug}${queryString ? `?${queryString}` : ""}`,
				);
			}
		} catch (error: unknown) {
			const err = unknownError(
				error,
				isNew ? "Failed to create product" : "Failed to update product",
			);
			toast.error(elysiaErrorToString(err));
		}
	};

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
		onSubmit: async () => {
			if (!isNew && hasCategoryChanged() && hasExistingAttributeValues()) {
				setAttributesToRemove(getAttributesToRemove());
				setShowCategoryWarning(true);
				return;
			}
			await executeSubmit();
		},
		onSubmitInvalid() {
			toast.error("Invalid submit");
		},
	});

	const handleConfirmCategoryChange = async () => {
		setShowCategoryWarning(false);
		await executeSubmit();
	};

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

	const [isDeleting, startTransition] = useTransition();
	const handleDelete = async () => {
		startTransition(async () => {
			try {
				const { error } = await app.products({ id: product.id }).delete();
				if (error) {
					toast.error(
						`Failed to delete product: ${elysiaErrorToString(error)}`,
					);
					return;
				}
				toast.success("Product deleted successfully");
				router.push(`/products${queryString ? `?${queryString}` : ""}`);
			} catch (error: unknown) {
				const err = unknownError(error, "Failed to delete product");
				toast.error(elysiaErrorToString(err));
			}
		});
	};

	const hasStock = product.variants.some((variant) => variant.stock > 0);
	return (
		<section className="w-full p-6 @container">
			<Form form={form} className="flex flex-col mx-auto max-w-260">
				<div className="grid gap-6 w-full @sm:grid-cols-[1fr_320px] @lg:grid-cols-[600px_320px] @xl:@lg:grid-cols-5">
					<div className="flex gap-3 @md:col-span-1 @lg:col-span-2 @xl:col-span-3 items-center">
						<Button variant="outline" size="icon" className="h-7 w-7" asChild>
							<Link href={`/products${queryString ? `?${queryString}` : ""}`}>
								<ChevronLeft className="h-4 w-4" />
								<span className="sr-only">Back</span>
							</Link>
						</Button>

						<h1 className="flex-1 shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight sm:grow-0 capitalize">
							{form.store.state.values.name}
						</h1>
						{hasStock ? (
							<Badge variant="outline" className="ml-auto sm:ml-0 text-xs">
								In stock
							</Badge>
						) : (
							<Badge variant="destructive" className="ml-auto sm:ml-0 text-xs">
								Out of stock
							</Badge>
						)}
					</div>

					{/* Boutons d'action (desktop) */}
					<div className="flex justify-end gap-3 @xl:col-span-2">
						{!isNew && (
							<Dialog>
								<DialogTrigger asChild>
									<Button variant="destructive" size="sm" type="button">
										Delete
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Delete product?</DialogTitle>
										<DialogDescription>
											This action cannot be undone.
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<DialogClose asChild>
											<Button variant="outline" disabled={isDeleting}>
												Cancel
											</Button>
										</DialogClose>
										<Button
											variant="destructive"
											onClick={() => handleDelete()}
											disabled={isDeleting}
										>
											{isDeleting ? (
												<>
													<Loader2 className="animate-spin" size={16} />{" "}
													Deleting...
												</>
											) : (
												"Delete"
											)}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						)}
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={handleDiscard}
						>
							Discard
						</Button>
						<form.SubmitButton size="sm">Save Product</form.SubmitButton>
					</div>

					<div className="grid @xl:col-span-3 gap-6">
						<ProductFormDetails form={form} isNew={isNew} />
						<ProductFormVariants form={form} />
					</div>
					<div className="grid @xl:col-span-2 gap-6">
						<ProductFormClassification
							form={form}
							isNew={isNew}
							initialCategories={categories}
						/>
						<ProductFormImages
							key={formResetKey}
							isNew={isNew}
							form={form}
							existingImages={product.images}
						/>
					</div>
				</div>

				{/* Boutons d'action (mobile) */}
				<div className="flex items-center justify-center gap-2 md:hidden">
					{!isNew && (
						<Button
							variant="destructive"
							size="sm"
							type="button"
							onClick={handleDelete}
						>
							Delete
						</Button>
					)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleDiscard}
					>
						Discard
					</Button>
					<form.SubmitButton size="sm">Save Product</form.SubmitButton>
				</div>
			</Form>

			<Dialog open={showCategoryWarning} onOpenChange={setShowCategoryWarning}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change category?</DialogTitle>
						<DialogDescription>
							Changing the category will delete all existing variants and their
							attribute values. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					{attributesToRemove.length > 0 && (
						<div className="space-y-3 max-h-60 overflow-y-auto">
							<p className="text-sm font-medium">
								The following attributes will be removed:
							</p>
							{attributesToRemove.map((attr) => (
								<div key={attr.attributeId} className="flex flex-wrap gap-1">
									{attr.values.map((value) => (
										<Badge key={value} variant="secondary">
											{value}
										</Badge>
									))}
								</div>
							))}
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCategoryWarning(false)}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirmCategoryChange}>
							Change category
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
};
