import type * as ProductModel from "@spice-world/server/modules/products/model";
import { Badge } from "@spice-world/ui/components/badge";
import { Checkbox } from "@spice-world/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@spice-world/ui/components/empty";
import { Skeleton } from "@spice-world/ui/components/skeleton";
import { Spinner } from "@spice-world/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@spice-world/ui/components/table";
import { Link } from "@teyik0/furin/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { api } from "../../../../lib/api";
import { formatPrice } from "../../../../lib/format";
import { BulkActions } from "./bulk-actions";
import type { ProductsQuery } from "./products-query";

export const PAGE_SIZE = 25;

const STATUS_VARIANT = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
} as const;

const price = ({ priceMin, priceMax }: ProductModel.productListItem) => {
  if (priceMin === null || priceMax === null) {
    return "—";
  }
  return priceMin === priceMax
    ? formatPrice(priceMin)
    : `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`;
};

export function ProductsTable({
  categories,
  initialData,
  query,
}: {
  categories: { id: string; name: string }[];
  initialData: ProductModel.productListItem[];
  query: ProductsQuery;
}) {
  const [products, setProducts] = useState(initialData);
  const [hasMore, setHasMore] = useState(initialData.length === PAGE_SIZE);
  const [loading, startTransition] = useTransition();
  const [selected, setSelected] = useState(new Set<string>());
  const sentinel = useRef<HTMLDivElement>(null);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // Infinite scroll: the next page loads when the sentinel under the table shows.
  useEffect(() => {
    const node = sentinel.current;
    if (!(node && hasMore) || loading) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        return;
      }
      observer.disconnect();
      startTransition(async () => {
        const { data, error } = await api().products.get({
          query: { ...query, skip: products.length, take: PAGE_SIZE },
        });
        if (error) {
          toast.error(
            `Couldn’t load more products. ${error.value.detail ?? error.value.title}`,
          );
          return;
        }
        setProducts((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, products.length, query]);

  if (products.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No products found</EmptyTitle>
          <EmptyDescription>
            Try another search, or clear the filters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const allSelected = selected.size === products.length;
  return (
    <div className="flex flex-col gap-3">
      {selected.size ? (
        <BulkActions
          categories={categories}
          ids={[...selected]}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all products"
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(
                      new Set(checked ? products.map((p) => p.id) : []),
                    )
                  }
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow
                className="relative"
                data-state={selected.has(product.id) ? "selected" : undefined}
                key={product.id}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${product.name}`}
                    checked={selected.has(product.id)}
                    className="relative z-10"
                    onCheckedChange={(checked) => {
                      const next = new Set(selected);
                      if (checked) {
                        next.add(product.id);
                      } else {
                        next.delete(product.id);
                      }
                      setSelected(next);
                    }}
                  />
                </TableCell>
                <TableCell className="max-w-0 min-w-48">
                  <div className="flex items-center gap-3">
                    {product.img ? (
                      <img
                        alt=""
                        className="size-10 shrink-0 rounded-md object-cover"
                        height={40}
                        loading="lazy"
                        src={product.img}
                        width={40}
                      />
                    ) : (
                      <div className="bg-muted size-10 shrink-0 rounded-md" />
                    )}
                    <Link
                      className="truncate font-medium after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                      params={{ slug: product.slug }}
                      to="/products/:slug"
                    >
                      {product.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[product.status]}>
                    {product.status.charAt(0) +
                      product.status.slice(1).toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {categoryName.get(product.categoryId) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {price(product)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${product.totalStock === 0 ? "text-destructive" : ""}`}
                >
                  {product.totalStock}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex h-8 items-center justify-center" ref={sentinel}>
        {loading ? <Spinner /> : null}
      </div>
    </div>
  );
}

export function ProductsTableSkeleton() {
  return <Skeleton className="h-96 rounded-lg" />;
}
