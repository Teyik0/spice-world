"use client";

import { useAtom, useAtomValue } from "jotai";
import { MinusIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GetProduct, ProductFormData } from "@/lib/elysia";
import { currentProductAtom, newProductAtom } from "./store";

export const ExistingProductCard = ({ product }: { product: GetProduct }) => {
	const router = useRouter();
	const pathname = usePathname();
	const currentProduct = useAtomValue(currentProductAtom);

	const isSelected = pathname.includes(product.slug);

	const handleClick = () => {
		router.push(`/dashboard/products/${product.slug}`);
	};

	return (
		<button
			type="button"
			key={product.id}
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4
			text-sm leading-tight whitespace-nowrap last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<div className="flex w-full items-center gap-2">
				<span>{currentProduct ? currentProduct.name : product.name}</span>
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs"
				>
					{currentProduct
						? currentProduct.status.toLowerCase()
						: product.status.toLowerCase()}
				</Badge>
			</div>
			<span className="font-medium">
				{currentProduct ? currentProduct.description : product.description}
			</span>
		</button>
	);
};

export const NewProductCard = ({ product }: { product: ProductFormData }) => {
	const router = useRouter();
	const pathname = usePathname();
	const newProduct = useAtomValue(newProductAtom);

	// Don't render if there's no new product in the atom
	if (!newProduct) return null;

	const isSelected = pathname.includes("/new");

	const handleClick = () => {
		router.push("/dashboard/products/new");
	};

	return (
		<button
			type="button"
			key="new-product"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4
			text-sm leading-tight whitespace-nowrap last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<div className="flex w-full items-center gap-2">
				<span>{product.name}</span>
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs"
				>
					new
				</Badge>
			</div>
			<span className="font-medium">{product.description}</span>
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
