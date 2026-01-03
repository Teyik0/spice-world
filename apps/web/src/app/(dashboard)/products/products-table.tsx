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
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { newProductAtom, selectedProductIdsAtom } from "./store";

interface Category {
	id: string;
	name: string;
}

interface ProductsTableProps {
	products: ProductModel.getResult;
	categories: Category[];
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
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const newProduct = useAtomValue(newProductAtom);

	if (!newProduct) return null;

	const isSelected = pathname === "/products/new";

	const handleClick = () => {
		if (isSelected) return;
		const params = searchParams.toString();
		router.push(`/products/new${params ? `?${params}` : ""}`, {
			scroll: false,
		});
	};

	const firstLetter = (newProduct.name || "N")[0]?.toUpperCase() || "N";

	return (
		<TableRow
			data-state={isSelected ? "selected" : undefined}
			className="cursor-pointer"
			onClick={handleClick}
		>
			<TableCell onClick={(e) => e.stopPropagation()}>
				<Checkbox disabled aria-label="New product" />
			</TableCell>
			<TableCell>
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
			<TableCell className="font-medium">
				{newProduct.name || "New product"}
			</TableCell>
			<TableCell>
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600"
				>
					{newProduct.status.toLowerCase()}
				</Badge>
			</TableCell>
			<TableCell>
				{getCategoryName(newProduct.categoryId, categories)}
			</TableCell>
			<TableCell className="text-muted-foreground">-</TableCell>
			<TableCell className="text-muted-foreground">-</TableCell>
			<TableCell>
				<Badge variant="outline">-</Badge>
			</TableCell>
		</TableRow>
	);
};

export function ProductsTable({ products, categories }: ProductsTableProps) {
	const router = useRouter();
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

	const handleRowClick = (slug: string) => {
		const params = searchParams.toString();
		router.push(`/products/${slug}${params ? `?${params}` : ""}`);
	};

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
					return (
						<TableRow
							key={product.id}
							data-state={
								isActive || selectedIds.has(product.id) ? "selected" : undefined
							}
							className="cursor-pointer"
							onClick={() => handleRowClick(product.slug)}
						>
							<TableCell onClick={(e) => e.stopPropagation()}>
								<Checkbox
									checked={selectedIds.has(product.id)}
									onCheckedChange={(checked) =>
										toggleOne(product.id, !!checked)
									}
									aria-label={`Select ${product.name}`}
								/>
							</TableCell>
							<TableCell>
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
							<TableCell className="font-medium">{product.name}</TableCell>
							<TableCell>
								<Badge variant={statusVariants[product.status]}>
									{product.status.toLowerCase()}
								</Badge>
							</TableCell>
							<TableCell>
								{getCategoryName(product.categoryId, categories)}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{product.priceMin}€
							</TableCell>
							<TableCell className="text-muted-foreground">
								{product.priceMax}€
							</TableCell>
							<TableCell>
								<Badge variant="outline">{product.totalStock}</Badge>
							</TableCell>
						</TableRow>
					);
				})}
				{products.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={7}
							className="text-center text-muted-foreground"
						>
							No products found
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}
