"use client";

import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@spice-world/web/components/ui/tooltip";
import { useAtom, useAtomValue } from "jotai";
import { MinusIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "./store";

export const NewProductItem = () => {
	const router = useRouter();
	const pathname = usePathname();
	const newProduct = useAtomValue(newProductAtom);

	// Only show on /products or /products/new
	if (pathname !== "/products" && pathname !== "/products/new") {
		return null;
	}

	// Don't show if there's no newProduct state
	if (!newProduct) return null;

	const isSelected = pathname === "/products/new";

	const handleClick = () => {
		// Prevent navigation if already on new product page
		if (isSelected) return;

		router.push("/products/new", { scroll: false });
	};

	return (
		<button
			type="button"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-start gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			{newProduct.img && (
				<Image
					src={newProduct.img}
					alt="New Product Image"
					width={48}
					height={48}
					className="rounded-md shrink-0 object-cover"
				/>
			)}
			<div className="flex flex-col items-start gap-1.5 min-w-0 flex-1">
				<div className="flex w-full items-center gap-2">
					<span className="first-letter:capitalize truncate">
						{newProduct.name || "New product"}
					</span>
					<Badge
						variant="secondary"
						className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs shrink-0"
					>
						{newProduct.status.toLowerCase()}
					</Badge>
				</div>
				<span className="font-medium text-muted-foreground text-xs text-left truncate w-full">
					{(() => {
						const desc = newProduct.description || "";
						const maxChars = 50;
						return desc && desc.length > maxChars
							? `${desc.slice(0, maxChars)}...`
							: desc;
					})()}
				</span>
			</div>
		</button>
	);
};

export const ProductItem = ({ product }: { product: ProductItemProps }) => {
	const currentProduct = useAtomValue(currentProductAtom);
	const router = useRouter();
	const pathname = usePathname();

	const isSelected = pathname.includes(product.slug);

	// Use currentProductAtom ONLY if this item is selected
	const displayProduct =
		isSelected && currentProduct?.slug === product.slug
			? currentProduct
			: product;

	const handleClick = () => {
		// Prevent navigation if already on this product
		if (isSelected) return;
		router.push(`/products/${product.slug}`);
	};

	return (
		<button
			type="button"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-start gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			{displayProduct.img && (
				<Image
					src={displayProduct.img}
					alt={`${product.name} Image`}
					width={48}
					height={48}
					className="rounded-md shrink-0 object-cover"
				/>
			)}
			<div className="flex flex-col items-start gap-1.5 min-w-0 flex-1">
				<div className="flex w-full items-center gap-2">
					<span className="first-letter:capitalize truncate">
						{displayProduct.name}
					</span>
					<Badge
						variant="secondary"
						className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs shrink-0"
					>
						{displayProduct.status.toLowerCase()}
					</Badge>
				</div>
				<span className="font-medium text-muted-foreground text-xs text-left truncate w-full">
					{(() => {
						const desc = displayProduct.description;
						const maxChars = 50;
						return desc && desc.length > maxChars
							? `${desc.slice(0, maxChars)}...`
							: desc;
					})()}
				</span>
			</div>
		</button>
	);
};

export const AddProductButton = () => {
	const [newProduct, setNewProduct] = useAtom(newProductAtom);
	const router = useRouter();

	const handleClick = (reset: boolean = false) => {
		if (reset) {
			setNewProduct(null);
			router.push("/products");
			return;
		}
		/*
		  We can't setNewProduct with default value here as there is two cases:
				- Click the AddProductButton
				- Direct Navigation to /products/
		 */
		router.push("/products/new");
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						onClick={() => handleClick(!!newProduct)}
						variant="outline"
						className="pl-2"
					>
						{newProduct ? <MinusIcon /> : <PlusIcon />}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{newProduct ? <p>Delete new product</p> : <p>Add a new product</p>}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
