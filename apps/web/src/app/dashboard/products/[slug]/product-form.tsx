"use client";

import { useAtom } from "jotai";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type GetCategory, type PostProduct, productAtom } from "@/lib/product";
import { ProductFormCategory } from "./product-form-category";
import { ProductFormDetails } from "./product-form-details";
import { ProductFormStatus } from "./product-form-status";
import { ProductFormStock } from "./product-form-stock";

export const ProductForm = (props: {
	product: PostProduct;
	categories: GetCategory[];
}) => {
	const [product, setProduct] = useAtom(productAtom);

	useEffect(() => {
		if (props.product) {
			setProduct(props.product);
		}
	}, [props.product, setProduct]);

	const handleDiscard = () => {
		setProduct(props.product);
	};

	const hasStock =
		product && "variants" in product && product.variants?.[0]?.stock;

	return (
		<form className="mx-auto grid max-w-236 flex-1 auto-rows-max gap-4">
			<div className="flex items-center gap-4">
				<Button variant="outline" size="icon" className="h-7 w-7" asChild>
					<Link href="/admin/products">
						<ChevronLeft className="h-4 w-4" />
						<span className="sr-only">Back</span>
					</Link>
				</Button>

				<h1 className="flex-1 shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight sm:grow-0 capitalize">
					{product?.name || "New Product"}
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
							onClick={() => handleDiscard()}
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
					<ProductFormDetails />
					<ProductFormStock />
				</div>
				<div className="grid auto-rows-max items-start gap-4 lg:gap-8">
					<ProductFormStatus />
					<ProductFormCategory initialCategories={props.categories} />
					{/*<ProductImgCard
						form={form}
						imgsUrls={imgsUrls}
						setImgsUrls={setImgsUrls}
						setFileList={setFileList}
					/>*/}
				</div>
			</div>

			<div className="flex items-center justify-center gap-2 md:hidden">
				{product && (
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => handleDiscard()}
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
