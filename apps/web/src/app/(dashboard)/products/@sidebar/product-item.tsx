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
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";
import { statusVariants } from "./products-table";

export const NewProductItem = () => {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const newProduct = useAtomValue(newProductAtom);

	if (!newProduct) return null;

	const isSelected = pathname === "/products/new";
	const params = searchParams.toString();
	const href = `/products/new${params ? `?${params}` : ""}`;
	const firstLetter = newProduct.name[0]?.toUpperCase() ?? "N";

	return (
		<Link
			href={href}
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-start gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
		>
			{newProduct.img ? (
				<Image
					src={newProduct.img}
					alt="New Product Image"
					width={48}
					height={48}
					className="rounded-md shrink-0 object-cover"
				/>
			) : (
				<div className="size-10 rounded-md bg-primary flex items-center justify-center text-muted font-medium shrink-0">
					{firstLetter}
				</div>
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
		</Link>
	);
};

export const ProductItem = ({ product }: { product: ProductItemProps }) => {
	const currentProduct = useAtomValue(currentProductAtom);
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const isSelected = pathname.includes(product.slug);
	const params = searchParams.toString();
	const href = `/products/${product.slug}${params ? `?${params}` : ""}`;

	const displayProduct =
		isSelected && currentProduct?.slug === product.slug
			? currentProduct
			: product;

	return (
		<Link
			href={href}
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-start gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
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
						variant={statusVariants[displayProduct.status]}
						className="ml-auto text-xs shrink-0"
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
		</Link>
	);
};

export const AddProductButton = () => {
	const [newProduct, setNewProduct] = useAtom(newProductAtom);
	const router = useRouter();
	const searchParams = useSearchParams();

	const handleClick = (reset: boolean = false) => {
		const params = searchParams.toString();
		if (reset) {
			setNewProduct(null);
			router.push(`/products${params ? `?${params}` : ""}`);
			return;
		}
		router.push(`/products/new${params ? `?${params}` : ""}`);
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
