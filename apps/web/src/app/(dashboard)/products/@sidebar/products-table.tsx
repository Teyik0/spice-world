"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { ClientOnly } from "@spice-world/web/components/client-only";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Checkbox } from "@spice-world/web/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@spice-world/web/components/ui/table";
import { useAtom, useAtomValue } from "jotai";
import { Loader2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { newProductAtom, selectedProductIdsAtom } from "../store";

interface Category {
	id: string;
	name: string;
}

interface ProductsTableProps {
	products: ProductModel.getResult;
	categories: Category[];
	loadMoreRef?: RefObject<HTMLDivElement | null>;
	isFetchingNextPage?: boolean;
	hasNextPage?: boolean;
}

export const statusVariants: Record<
	string,
	"default" | "secondary" | "outline"
> = {
	PUBLISHED: "default",
	DRAFT: "secondary",
	ARCHIVED: "outline",
};

const getCategoryName = (categoryId: string, categories: Category[]) => {
	return categories.find((c) => c.id === categoryId)?.name ?? "-";
};

const NewProductTableRow = ({ categories }: { categories: Category[] }) => {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const newProduct = useAtomValue(newProductAtom);

	if (!newProduct) return null;

	const isSelected = pathname === "/products/new";
	const params = searchParams.toString();
	const href = `/products/new${params ? `?${params}` : ""}`;
	const firstLetter = (newProduct.name || "N")[0]?.toUpperCase() || "N";

	return (
		<TableRow
			data-state={isSelected ? "selected" : undefined}
			className="cursor-pointer group relative"
		>
			<Link
				href={href}
				className="absolute inset-0 z-0"
				aria-label="View new product"
			/>
			<TableCell onClick={(e) => e.stopPropagation()} className="relative z-10">
				<Checkbox disabled aria-label="New product" />
			</TableCell>
			<TableCell className="relative z-10">
				{newProduct.img ? (
					<Image
						src={newProduct.img}
						alt="New Product"
						width={48}
						height={48}
						className="rounded-md object-cover"
					/>
				) : (
					<div className="size-10 rounded-md bg-primary flex items-center justify-center text-muted font-medium">
						{firstLetter}
					</div>
				)}
			</TableCell>
			<TableCell className="font-medium relative z-10">
				{newProduct.name || "New product"}
			</TableCell>
			<TableCell className="relative z-10">
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600"
				>
					{newProduct.status.toLowerCase()}
				</Badge>
			</TableCell>
			<TableCell className="relative z-10">
				{getCategoryName(newProduct.categoryId, categories)}
			</TableCell>
			<TableCell className="text-muted-foreground relative z-10">-</TableCell>
			<TableCell className="text-muted-foreground relative z-10">-</TableCell>
			<TableCell className="relative z-10">
				<Badge variant="outline">-</Badge>
			</TableCell>
		</TableRow>
	);
};

export function ProductsTable({
	products,
	categories,
	loadMoreRef,
	isFetchingNextPage,
}: ProductsTableProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [selectedIds, setSelectedIds] = useAtom(selectedProductIdsAtom);

	const toggleAll = (checked: boolean) => {
		setSelectedIds(checked ? new Set(products.map((p) => p.id)) : new Set());
	};

	const toggleOne = (id: string, checked: boolean) => {
		const next = new Set(selectedIds);
		if (checked) {
			next.add(id);
		} else {
			next.delete(id);
		}
		setSelectedIds(next);
	};

	const allSelected =
		products.length > 0 && selectedIds.size === products.length;
	const someSelected = selectedIds.size > 0 && !allSelected;

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10">
						<Checkbox
							checked={someSelected ? "indeterminate" : allSelected}
							onCheckedChange={(checked) => toggleAll(!!checked)}
							aria-label="Select all products"
						/>
					</TableHead>
					<TableHead className="w-24">Image</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Category</TableHead>
					<TableHead>Price (min)</TableHead>
					<TableHead>Price (max)</TableHead>
					<TableHead>Stock</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				<ClientOnly>
					<NewProductTableRow categories={categories} />
				</ClientOnly>
				{products.map((product) => {
					const isActive = pathname.includes(product.slug);
					const params = searchParams.toString();
					const href = `/products/${product.slug}${params ? `?${params}` : ""}`;
					return (
						<TableRow
							key={product.id}
							data-state={
								isActive || selectedIds.has(product.id) ? "selected" : undefined
							}
							className="cursor-pointer group relative"
						>
							<Link
								href={href}
								className="absolute inset-0 z-0"
								aria-label={`View ${product.name}`}
							/>
							<TableCell
								onClick={(e) => e.stopPropagation()}
								className="relative z-10"
							>
								<Checkbox
									checked={selectedIds.has(product.id)}
									onCheckedChange={(checked) =>
										toggleOne(product.id, !!checked)
									}
									aria-label={`Select ${product.name}`}
								/>
							</TableCell>
							<TableCell className="relative z-10">
								{product.img ? (
									<Image
										src={product.img}
										alt={product.name}
										width={48}
										height={48}
										className="rounded-md object-cover"
									/>
								) : (
									<div className="size-10 rounded-md bg-muted" />
								)}
							</TableCell>
							<TableCell className="font-medium relative z-10">
								{product.name}
							</TableCell>
							<TableCell className="relative z-10">
								<Badge variant={statusVariants[product.status]}>
									{product.status.toLowerCase()}
								</Badge>
							</TableCell>
							<TableCell className="relative z-10">
								{getCategoryName(product.categoryId, categories)}
							</TableCell>
							<TableCell className="text-muted-foreground relative z-10">
								{product.priceMin}€
							</TableCell>
							<TableCell className="text-muted-foreground relative z-10">
								{product.priceMax}€
							</TableCell>
							<TableCell className="relative z-10">
								<Badge variant="outline">{product.totalStock}</Badge>
							</TableCell>
						</TableRow>
					);
				})}
				{products.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={8}
							className="text-center text-muted-foreground"
						>
							No products found
						</TableCell>
					</TableRow>
				)}
				{loadMoreRef && (
					<TableRow>
						<TableCell colSpan={8} className="h-10 p-0">
							<div
								ref={loadMoreRef}
								className="flex items-center justify-center h-full"
							>
								{isFetchingNextPage && (
									<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
								)}
							</div>
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}
