import type * as ProductModel from "@spice-world/server/modules/products/model";
import { LOW_STOCK_THRESHOLD } from "@spice-world/server/modules/products/model";
import { Badge } from "@spice-world/ui/components/badge";
import { Button } from "@spice-world/ui/components/button";
import { Checkbox } from "@spice-world/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@spice-world/ui/components/dropdown-menu";
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
import { useInfiniteQuery } from "@teyik0/furin/client";
import { Link } from "@teyik0/furin/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  PencilIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "../../../../lib/api";
import { formatAgo, formatCount, formatPrice } from "../../../../lib/format";
import { BulkActions } from "./bulk-actions";
import { useQuickEditContext } from "./product-quick-edit";
import type { ProductsQuery } from "./products-query";
import { label, listQuery, STATUSES, useProductsQuery } from "./products-query";
import {
  CategoryFilter,
  FilterGroup,
  MENU_CONTENT,
  MENU_ITEM,
  MENU_LABEL,
  MenuCount,
} from "./products-toolbar";

export const PAGE_SIZE = 25;

const STATUS_BADGE = {
  PUBLISHED: "bg-success/10 text-success dark:bg-success/20",
  DRAFT: "bg-warning/10 text-warning dark:bg-warning/20",
  ARCHIVED: "bg-muted text-muted-foreground",
} as const;

function Price({ priceMin, priceMax }: ProductModel.productListItem) {
  if (priceMin === null || priceMax === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <>
      {formatPrice(priceMin)}
      {priceMin === priceMax ? null : (
        <span className="text-muted-foreground text-xs">
          {" "}
          – {formatPrice(priceMax)}
        </span>
      )}
    </>
  );
}

const STOCK_ALERT = {
  out: ["text-destructive", "Out"],
  low: ["text-warning", "Low"],
} as const;

function Stock({ totalStock }: ProductModel.productListItem) {
  const alert =
    totalStock === 0
      ? STOCK_ALERT.out
      : totalStock < LOW_STOCK_THRESHOLD && STOCK_ALERT.low;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${alert ? alert[0] : ""}`}
    >
      {alert ? (
        <span className="rounded bg-current/12 px-1.5 text-[11px] leading-5 font-medium">
          {alert[1]}
        </span>
      ) : null}
      {totalStock}
    </span>
  );
}

type SortOption = readonly [
  NonNullable<ProductsQuery["sortBy"]>,
  "asc" | "desc",
  string,
];
const NAME_SORTS: SortOption[] = [
  ["name", "asc", "A → Z"],
  ["name", "desc", "Z → A"],
];
const PRICE_SORTS: SortOption[] = [
  ["priceMin", "asc", "Lowest First"],
  ["priceMax", "desc", "Highest First"],
];
const UPDATED_SORTS: SortOption[] = [
  ["updatedAt", "desc", "Newest First"],
  ["updatedAt", "asc", "Oldest First"],
];
const STOCK_SORTS: SortOption[] = [
  ["totalStock", "asc", "Lowest First"],
  ["totalStock", "desc", "Highest First"],
];

function ColumnHeader({
  align = "start",
  children,
  filtered = false,
  sorts = [],
  title,
}: {
  align?: "start" | "end";
  children?: ReactNode;
  filtered?: boolean;
  sorts?: SortOption[];
  title: string;
}) {
  const [query, update] = useProductsQuery();
  const sortBy = query.sortBy ?? "name";
  const sortDir = query.sortDir ?? "asc";
  const sorted = sorts.some(([by]) => by === sortBy);
  const SortIcon = sortDir === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={`group -mx-2.5 h-7 px-2.5 ${filtered || sorted ? "" : "text-muted-foreground"}`}
            size="sm"
            variant="ghost"
          />
        }
      >
        {title}
        {filtered ? (
          <span
            aria-label="Filtered"
            className="bg-primary size-1.5 rounded-full"
            role="img"
          />
        ) : null}
        {sorted ? (
          <SortIcon
            aria-label={`Sorted ${sortDir === "asc" ? "ascending" : "descending"}`}
          />
        ) : (
          <ChevronDownIcon className="opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50 group-data-popup-open:opacity-50" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={MENU_CONTENT}>
        {sorts.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className={MENU_LABEL}>Sort</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const pick = sorts.find(
                  ([by, dir]) => `${by}:${dir}` === value,
                );
                if (pick) {
                  update({ sortBy: pick[0], sortDir: pick[1] });
                }
              }}
              value={`${sortBy}:${sortDir}`}
            >
              {sorts.map(([by, dir, text]) => (
                <DropdownMenuRadioItem
                  className={MENU_ITEM}
                  key={text}
                  value={`${by}:${dir}`}
                >
                  {text}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        ) : null}
        {sorts.length > 0 && children ? <DropdownMenuSeparator /> : null}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductsTable({
  categories,
  facets,
  query,
}: {
  categories: { id: string; name: string }[];
  facets: ProductModel.facets;
  query: ProductsQuery;
}) {
  const total = facets.status[query.status ?? "ALL"];
  /** Headers show the query as just set; the rows stay on the loaded one. */
  const [current, update] = useProductsQuery();
  const { pages, fetchNext, hasNext, isFetching, error } = useInfiniteQuery(
    (index) =>
      api.products.get.live({
        query: {
          ...listQuery(query),
          skip: index * PAGE_SIZE,
          take: PAGE_SIZE,
        },
      }),
    { next: (last) => last.length === PAGE_SIZE },
  );
  const products = pages.flat();
  const [selected, setSelected] = useState(new Set<string>());
  const quickEdit = useQuickEditContext();
  const sentinel = useRef<HTMLDivElement>(null);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  useEffect(() => {
    const node = sentinel.current;
    if (!(node && hasNext) || isFetching) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        observer.disconnect();
        fetchNext();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNext, hasNext, isFetching]);

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
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-3">
                <Checkbox
                  aria-label={`Select ${products.length} loaded products`}
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(
                      new Set(checked ? products.map((p) => p.id) : []),
                    )
                  }
                />
              </TableHead>
              <TableHead>
                <ColumnHeader sorts={NAME_SORTS} title="Product" />
              </TableHead>
              <TableHead>
                <ColumnHeader filtered={Boolean(current.status)} title="Status">
                  <FilterGroup>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) =>
                        update({ status: STATUSES.find((s) => s === value) })
                      }
                      value={current.status ?? "ALL"}
                    >
                      {(["ALL", ...STATUSES] as const).map((status) => (
                        <DropdownMenuRadioItem
                          className={MENU_ITEM}
                          key={status}
                          value={status}
                        >
                          {label(status)}
                          <MenuCount value={facets.status[status]} />
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </FilterGroup>
                </ColumnHeader>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <ColumnHeader
                  filtered={Boolean(current.categories)}
                  title="Category"
                >
                  <CategoryFilter
                    categories={categories}
                    counts={facets.category}
                  />
                </ColumnHeader>
              </TableHead>
              <TableHead className="text-right">
                <ColumnHeader align="end" sorts={PRICE_SORTS} title="Price" />
              </TableHead>
              <TableHead className="text-right">
                <ColumnHeader
                  align="end"
                  filtered={Boolean(current.stock)}
                  sorts={STOCK_SORTS}
                  title="Stock"
                >
                  <FilterGroup>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) =>
                        update({
                          stock:
                            value === "low" || value === "out"
                              ? value
                              : undefined,
                        })
                      }
                      value={current.stock ?? "any"}
                    >
                      <DropdownMenuRadioItem className={MENU_ITEM} value="any">
                        Any Stock
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem className={MENU_ITEM} value="low">
                        Low, Under {LOW_STOCK_THRESHOLD}
                        <MenuCount value={facets.stock.low} />
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem className={MENU_ITEM} value="out">
                        Out of Stock
                        <MenuCount value={facets.stock.out} />
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </FilterGroup>
                </ColumnHeader>
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                <ColumnHeader sorts={UPDATED_SORTS} title="Updated" />
              </TableHead>
              <TableHead className="w-12 pr-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow
                className="group/row data-[state=selected]:bg-primary/10 relative data-peeked:shadow-[inset_2px_0_0_var(--primary)]"
                data-peeked={
                  quickEdit.open && quickEdit.id === product.id ? "" : undefined
                }
                data-state={selected.has(product.id) ? "selected" : undefined}
                key={product.id}
              >
                <TableCell className="pl-3">
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
                <TableCell className="max-w-0 min-w-56 py-3">
                  <div className="flex items-center gap-3">
                    {product.img ? (
                      <img
                        alt=""
                        className="size-10 shrink-0 rounded-lg object-cover"
                        height={40}
                        loading="lazy"
                        src={product.img}
                        width={40}
                      />
                    ) : (
                      <div className="bg-muted size-10 shrink-0 rounded-lg" />
                    )}
                    <div className="grid min-w-0">
                      <Link
                        className="truncate font-medium after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                        params={{ slug: product.slug }}
                        to="/products/:slug"
                      >
                        {product.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {product.variantCount === 1
                          ? "1 variant"
                          : `${product.variantCount || "No"} variants`}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[product.status]}>
                    {label(product.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {categoryName.get(product.categoryId) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Price {...product} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Stock {...product} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                  <time
                    dateTime={new Date(product.updatedAt).toISOString()}
                    suppressHydrationWarning
                  >
                    {formatAgo(product.updatedAt)}
                  </time>
                </TableCell>
                <TableCell className="pr-3">
                  <Button
                    aria-label={`Quick edit ${product.name}`}
                    className="relative z-10 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    onClick={() => quickEdit.edit(product.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div
        className="text-muted-foreground flex h-8 items-center justify-center gap-2 text-xs tabular-nums"
        ref={sentinel}
      >
        {isFetching ? <Spinner /> : null}
        Showing {formatCount(products.length)} of {formatCount(total)}
        {error ? (
          <Button onClick={fetchNext} size="xs" variant="outline">
            Couldn’t load more. Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProductsTableSkeleton() {
  return <Skeleton className="h-96 rounded-lg" />;
}
