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
import { usePathname, useRouter } from "next/navigation";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "./store";

export const ProductItem = ({ product }: { product?: ProductItemProps }) => {
	const router = useRouter();
	const pathname = usePathname();

	const isNew =
		pathname === "/dashboard/products/new" ||
		pathname === "/dashboard/products";
	const currentProduct = useAtomValue(
		isNew ? newProductAtom : currentProductAtom,
	);
	if (!isNew || !currentProduct) return null;

	const isSelected = pathname.includes(product ? product.slug : "new");

	const handleClick = () => {
		router.push(`/dashboard/products/${product ? product.slug : "new"}`);
	};

	return (
		<button
			type="button"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4
			text-sm leading-tight whitespace-nowrap last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<div className="flex w-full items-center gap-2">
				<span>
					{currentProduct
						? currentProduct.name
						: product
							? product.name
							: "new"}
				</span>
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs"
				>
					{currentProduct
						? currentProduct.status.toLowerCase()
						: product
							? product.status.toLowerCase()
							: "new"}
				</Badge>
			</div>
			<span className="font-medium">
				{currentProduct
					? currentProduct.description
					: product
						? product.description
						: ""}
			</span>
		</button>
	);
};

export const AddProductButton = () => {
	const [newProduct, setNewProduct] = useAtom(newProductAtom);
	const router = useRouter();

	const handleClick = (reset: boolean = false) => {
		if (reset) {
			setNewProduct(null);
			router.push("/dashboard/products");
			return;
		}
		/*
		  We can't setNewProduct with default value here as there is two cases:
				- Click the AddProductButton
				- Direct Navigation to /dashboard/products/
		 */
		router.push("/dashboard/products/new");
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
