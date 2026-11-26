"use client";

import type * as ProductModel from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/web/components/ui/button";
import { useHydrateAtoms } from "jotai/utils";
import {
  Loader2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react";

import { useSidebarExpanded } from "../../sidebar-provider";
import { productPagesAtom } from "../store";
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
  categories: Category[];
}

export function ProductsSidebar({ categories }: ProductsSidebarProps) {
  const [expanded, setExpanded] = useSidebarExpanded();
  const { products, ref, isFetching, containerRef } = useProductsInfinite();

  return (
    <aside
      className="bg-background hidden h-screen w-full flex-col overflow-hidden border-l md:flex"
      data-expanded={expanded}
    >
      <header className="flex h-16 items-center gap-2 border-b p-3">
        <ProductsSearchBar categories={categories} />
        <AddProductButton />
        <Button
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          onClick={() => setExpanded(!expanded)}
          size="icon"
          variant="ghost"
        >
          <PanelLeftCloseIcon
            className={`${expanded ? "block" : "hidden"} size-4`}
          />
          <PanelLeftOpenIcon
            className={`${expanded ? "hidden" : "block"} size-4`}
          />
        </Button>
      </header>

      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className={expanded ? "block" : "hidden"}>
          <BulkActionsBar categories={categories} />
          <ProductsTable categories={categories} products={products} />
        </div>

        <div className={expanded ? "hidden" : "block"}>
          <NewProductItem />
          {products?.map((product) => (
            <ProductItem key={product.id} product={product} />
          ))}
          {products.length === 0 && (
            <div className="text-muted-foreground p-4 text-center text-sm">
              No products found
            </div>
          )}
        </div>

        <div className="flex h-10 items-center justify-center" ref={ref}>
          {isFetching ? (
            <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export function ProductsHydrator({
  initialProducts,
  children,
}: {
  initialProducts: ProductModel.productListItem[];
  children: React.ReactNode;
}) {
  useHydrateAtoms([[productPagesAtom, [initialProducts]]]);
  return children;
}
