"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { ClientOnly } from "@spice-world/web/components/client-only";
import { Button } from "@spice-world/web/components/ui/button";
import { useAtomValue } from "jotai";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useEffect } from "react";
import { useSidebarExpanded, useSidebarScroll } from "../sidebar-provider";
import { BulkActionsBar } from "./bulk-menu";
import { AddProductButton, NewProductItem, ProductItem } from "./product-item";
import { ProductsTable } from "./products-table";
import { ProductsSearchBar } from "./search-bar";
import { selectedProductIdsAtom } from "./store";

interface Category {
	id: string;
	name: string;
}

interface ProductsSidebarProps {
	products: ProductModel.getResult;
	categories: Category[];
}

export function ProductsSidebar({
	products,
	categories,
}: ProductsSidebarProps) {
	const [expanded, setExpanded] = useSidebarExpanded();
	const { scrollRef, restoreScrollPosition } = useSidebarScroll();
	const selectedIds = useAtomValue(selectedProductIdsAtom);
	const selectedIdsArray = Array.from(selectedIds);

	useEffect(() => {
		restoreScrollPosition();
	});

	return (
		<aside
			data-expanded={expanded}
			className="hidden md:flex flex-col border-l bg-background h-screen overflow-hidden w-full"
		>
			<header className="p-3 border-b h-16 items-center flex gap-2">
				<ProductsSearchBar categories={categories} />
				<ClientOnly>
					<AddProductButton />
				</ClientOnly>
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

			{selectedIds.size > 0 && (
				<BulkActionsBar
					selectedCount={selectedIds.size}
					selectedIds={selectedIdsArray}
					categories={categories}
				/>
			)}

			<div ref={scrollRef} className="flex-1 overflow-auto">
				{expanded ? (
					<ProductsTable products={products} categories={categories} />
				) : (
					<>
						<ClientOnly>
							<NewProductItem />
						</ClientOnly>
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
			</div>
		</aside>
	);
}
