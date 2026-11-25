"use client";

import type * as ProductModel from "@spice-world/server/modules/products/model";
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
import { formatPrice } from "@spice-world/web/lib/utils";
import { useAtom, useAtomValue } from "jotai";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { newProductAtom, selectedProductIdsAtom } from "../store";

interface Category {
  id: string;
  name: string;
}

interface ProductsTableProps {
  categories: Category[];
  products: ProductModel.productListItem[];
}

export const statusVariants: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

export const getCategoryName = (
  categoryId: string | undefined,
  categories: Category[],
) => categories.find((c) => c.id === categoryId)?.name ?? "-";

const NewProductTableRow = ({ categories }: { categories: Category[] }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newProduct = useAtomValue(newProductAtom);
  const router = useRouter();

  if (!newProduct) {
    return null;
  }

  const isSelected = pathname === "/products/new";
  const params = searchParams.toString();
  const href = `/products/new${params ? `?${params}` : ""}`;
  const firstLetter = (newProduct.name || "N")[0]?.toUpperCase() || "N";

  return (
    <TableRow
      className="group relative cursor-pointer"
      data-state={isSelected ? "selected" : undefined}
      onClick={() => router.push(href)}
      onKeyDown={(e) =>
        (e.key === "Enter" || e.key === " ") && router.push(href)
      }
      role="link"
      tabIndex={0}
    >
      <TableCell className="relative z-10" onClick={(e) => e.stopPropagation()}>
        <Checkbox aria-label="New product" disabled />
      </TableCell>
      <TableCell className="relative z-10">
        {newProduct.img ? (
          <Image
            alt="New Product"
            className="rounded-md object-cover"
            height={48}
            src={newProduct.img}
            width={48}
          />
        ) : (
          <div className="bg-primary text-muted flex size-10 items-center justify-center rounded-md font-medium">
            {firstLetter}
          </div>
        )}
      </TableCell>
      <TableCell className="relative z-10 font-medium">
        {newProduct.name || "New product"}
      </TableCell>
      <TableCell className="relative z-10">
        <Badge
          className="bg-blue-500 font-semibold text-white dark:bg-blue-600"
          variant="secondary"
        >
          {(newProduct.status ?? "DRAFT").toLowerCase()}
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

export function ProductsTable({ products, categories }: ProductsTableProps) {
  const [selectedIds, setSelectedIds] = useAtom(selectedProductIdsAtom);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

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
              aria-label="Select all products"
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => toggleAll(!!checked)}
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
        <NewProductTableRow categories={categories} />
        {products.map((product) => {
          const isActive = pathname.includes(product.slug);
          const params = searchParams.toString();
          const href = `/products/${product.slug}${params ? `?${params}` : ""}`;

          return (
            <TableRow
              className="group relative cursor-pointer"
              data-state={
                isActive || selectedIds.has(product.id) ? "selected" : undefined
              }
              key={product.id}
              onClick={() => router.push(href)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && router.push(href)
              }
              role="link"
              tabIndex={0}
            >
              <TableCell
                className="relative z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  aria-label={`Select ${product.name}`}
                  checked={selectedIds.has(product.id)}
                  onCheckedChange={(checked) =>
                    toggleOne(product.id, !!checked)
                  }
                />
              </TableCell>
              <TableCell className="relative z-10">
                {product.img ? (
                  <Image
                    alt={product.name}
                    className="rounded-md object-cover"
                    height={48}
                    loading="lazy"
                    sizes="48px"
                    src={product.img}
                    width={48}
                  />
                ) : (
                  <div className="bg-muted size-10 rounded-md" />
                )}
              </TableCell>
              <TableCell className="relative z-10 font-medium">
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
                {formatPrice(product.priceMin)}
              </TableCell>
              <TableCell className="text-muted-foreground relative z-10">
                {formatPrice(product.priceMax)}
              </TableCell>
              <TableCell className="relative z-10">
                <Badge variant="outline">{product.totalStock}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
        {products.length === 0 && (
          <TableRow>
            <TableCell colSpan={8}>No products found</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
