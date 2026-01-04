"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Loader2Icon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
} from "lucide-react";
import { useSidebarExpanded } from "../../sidebar-provider";
import { BulkActionsBar } from "./bulk-menu";
import { AddProductButton, NewProductItem, ProductItem } from "./product-item";
import { ProductsTable } from "./products-table";
import { ProductsSearchBar } from "./search-bar";
import { useProductsInfinite } from "./use-products-infinite";

interface Category {
	id: string;
	name: string;
}

interface ProductsSidebarProps {
	initialProducts: ProductModel.getResult;
	categories: Category[];
}

export function ProductsSidebar({
	initialProducts,
	categories,
}: ProductsSidebarProps) {
	const [expanded, setExpanded] = useSidebarExpanded();
	const { products, ref, isFetching, containerRef } =
		useProductsInfinite(initialProducts);

	return (
		<aside
			data-expanded={expanded}
			className="hidden md:flex flex-col border-l bg-background h-screen overflow-hidden w-full"
		>
			<header className="p-3 border-b h-16 items-center flex gap-2">
				<ProductsSearchBar categories={categories} />
				<AddProductButton />
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setExpanded(!expanded)}
					aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
				>
					{expanded ? (
						<PanelLeftCloseIcon className="size-4" />
					) : (
						<PanelLeftOpenIcon className="size-4" />
					)}
				</Button>
			</header>

			<div ref={containerRef} className="flex-1 overflow-auto">
				{expanded ? (
					<>
						<BulkActionsBar categories={categories} />
						<ProductsTable products={products} categories={categories} />
					</>
				) : (
					<>
						<NewProductItem />
						{products?.map((product) => (
							<ProductItem key={product.id} product={product} />
						))}
						{products.length === 0 && (
							<div className="p-4 text-center text-muted-foreground text-sm">
								No products found
							</div>
						)}
					</>
				)}
				<div ref={ref} className="h-10 flex items-center justify-center">
					{isFetching && (
						<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
					)}
				</div>
			</div>
		</aside>
	);
}
