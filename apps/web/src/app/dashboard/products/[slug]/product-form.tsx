"use client";

import { useAtom } from "jotai";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	app,
	type GetCategory,
	type ProductFormData,
	type TreatyMethodState,
} from "@/lib/elysia";
import { unknownError } from "@/lib/utils";
import {
	currentProductAtom,
	newProductAtom,
	newProductDefault,
} from "../store";
import { ProductFormDetails } from "./product-form-details";
import { ProductFormImages } from "./product-form-images";
import { ProductFormOrganization } from "./product-form-organization";
import { ProductFormTags } from "./product-form-tags";
import { ProductFormVariants } from "./product-form-variants";

export const ProductForm = (props: {
	product: ProductFormData;
	categories: GetCategory[];
}) => {
	const router = useRouter();
	const isNew = props.product.id === "new";
	const [product, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	useEffect(() => {
		if (props.product) {
			setProduct(
				isNew
					? {
							...newProductDefault,
							categoryId: props.categories[0] ? props.categories[0].id : "",
						}
					: props.product,
			);
		}
	}, [props.product, setProduct, isNew, props.categories]);

	const validateProduct = (): boolean => {
		if (!product) return false;
		if (!product.name?.trim()) {
			toast.error("Product name is required");
			return false;
		}
		if (!product.categoryId) {
			toast.error("Category is required");
			return false;
		}
		if (!product.images || product.images.length === 0) {
			toast.error("At least one image is required");
			return false;
		}
		if (!product.variants || product.variants.length === 0) {
			toast.error("At least one variant is required");
			return false;
		}
		if (product.variants.some((v) => v.price <= 0)) {
			toast.error("All variants must have a price greater than 0");
			return false;
		}
		return true;
	};

	const [, submitProduct] = useActionState(
		async (_prevState: TreatyMethodState<typeof app.products.post>) => {
			try {
				if (!product || !validateProduct()) return null;

				const { data, error } = await app.products.post({
					name: product.name,
					description: product.description,
					categoryId: product.categoryId || "",
					status: product.status,
					tags: JSON.stringify(product.tags) as unknown as string[],
					variants: JSON.stringify(
						product.variants,
					) as unknown as typeof product.variants,
					images: product.images,
				});

				if (error) {
					toast.error("Failed to create product");
					return error;
				}

				if (data) {
					toast.success("Product created successfully");
					router.push(`/dashboard/products/${data.slug}`);
					return data;
				}
				return null;
			} catch (error: unknown) {
				return unknownError(error, "Failed to create product");
			}
		},
		null,
	);

	const [, patchProduct] = useActionState(
		async (
			_prevState: TreatyMethodState<ReturnType<typeof app.products>["patch"]>,
		) => {
			try {
				if (!product || !validateProduct()) return null;

				const { data, error } = await app.products({ id: product.id }).patch({
					name: product.name,
					description: product.description,
					categoryId: product.categoryId || undefined,
					status: product.status,
					tags: JSON.stringify(product.tags) as unknown as string[],
					variants: JSON.stringify(
						product.variants,
					) as unknown as typeof product.variants,
					images: product.images,
				});

				if (error) {
					toast.error("Failed to update product");
					return error;
				}

				if (data) {
					toast.success("Product updated successfully");
					router.push(`/dashboard/products/${data.slug}`);
					return data;
				}
				return null;
			} catch (error: unknown) {
				return unknownError(error, "Failed to update product");
			}
		},
		null,
	);

	const hasStock =
		product && "variants" in product && product.variants?.[0]?.stock;

	return (
		<form
			action={isNew ? submitProduct : patchProduct}
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
					{product ? product.name : props.product.name}
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
					{product && (
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={() => setProduct(props.product)}
						>
							Discard
						</Button>
					)}
					<Button size="sm" type="submit">
						Save Product
					</Button>
				</div>
			</div>

			<div className="grid gap-4 w-full md:grid-cols-[1fr_250px] lg:grid-cols-3 lg:gap-8">
				<div className="grid auto-rows-max items-start gap-4 lg:col-span-2 lg:gap-8">
					<ProductFormDetails isNew={isNew} />
					<ProductFormVariants isNew={isNew} categoryId={product?.categoryId} />
					<ProductFormTags isNew={isNew} />
				</div>
				<div className="grid auto-rows-max items-start gap-4 lg:gap-8">
					<ProductFormOrganization
						isNew={isNew}
						initialCategories={props.categories}
					/>
					<ProductFormImages isNew={isNew} />
				</div>
			</div>

			<div className="flex items-center justify-center gap-2 md:hidden">
				{product && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setProduct(props.product)}
					>
						Discard
					</Button>
				)}
				<Button size="sm" type="submit">
					Save Product
				</Button>
			</div>
		</form>
	);
};
