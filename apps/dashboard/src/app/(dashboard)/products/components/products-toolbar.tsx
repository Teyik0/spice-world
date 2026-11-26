import type * as ProductModel from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@spice-world/ui/components/dropdown-menu";
import { Input } from "@spice-world/ui/components/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@spice-world/ui/components/toggle-group";
import {
  ArrowUpDownIcon,
  ListFilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { formatCount } from "../../../../lib/format";
import type { ProductsQuery } from "./products-query";
import {
  label,
  STATUSES,
  usePrefetchQuery,
  useUpdateQuery,
} from "./products-query";

const SORTS = {
  name: "Name",
  createdAt: "Created",
  updatedAt: "Updated",
  priceMin: "Lowest Price",
  priceMax: "Highest Price",
  totalStock: "Stock",
} satisfies Record<NonNullable<ProductsQuery["sortBy"]>, string>;

const STOCK_LABELS = { low: "Low", out: "Out of Stock" } as const;

/** Check on the left, count on the right: shared by every sort and filter menu. */
export const MENU_ITEM =
  "gap-2 py-1.5 pr-2 pl-8 *:data-[slot$=indicator]:right-auto *:data-[slot$=indicator]:left-2 *:data-[slot$=indicator]:text-primary";

/** Count shown at the end of a menu item. */
export function MenuCount({ value }: { value: number }) {
  return (
    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
      {formatCount(value)}
    </span>
  );
}

/** Width shared by every products menu, wide enough for long category names. */
export const MENU_CONTENT = "max-h-80 w-64";
export const MENU_LABEL = "px-2 pt-1.5 text-[11px] tracking-wider uppercase";

export function FilterGroup({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className={MENU_LABEL}>Filter</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

/** Shared by the toolbar menu and the Category column header. */
export function CategoryFilter({
  categories,
  counts,
  query,
}: {
  categories: { id: string; name: string }[];
  counts: ProductModel.facets["category"];
  query: ProductsQuery;
}) {
  const update = useUpdateQuery(query);
  const picked = new Set(query.categories);
  return (
    <FilterGroup>
      {categories.map(({ id, name }) => (
        <DropdownMenuCheckboxItem
          checked={picked.has(name)}
          className={MENU_ITEM}
          key={id}
          onCheckedChange={(checked) => {
            const next = new Set(picked);
            if (checked) {
              next.add(name);
            } else {
              next.delete(name);
            }
            update({ categories: next.size ? [...next] : undefined });
          }}
        >
          {name}
          <MenuCount value={counts[name] ?? 0} />
        </DropdownMenuCheckboxItem>
      ))}
      {picked.size ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={MENU_ITEM}
            onClick={() => update({ categories: undefined })}
          >
            Clear categories
          </DropdownMenuItem>
        </>
      ) : null}
    </FilterGroup>
  );
}

/** "1 248 products · 31 low on stock · 4 out of stock", each alert a filter. */
function ProductsSummary({
  facets,
  query,
}: {
  facets: ProductModel.facets;
  query: ProductsQuery;
}) {
  const update = useUpdateQuery(query);
  const alerts = [
    ["low", `${formatCount(facets.stock.low)} low on stock`, "text-warning"],
    [
      "out",
      `${formatCount(facets.stock.out)} out of stock`,
      "text-destructive",
    ],
  ] as const;
  return (
    <p className="text-muted-foreground text-sm">
      <span className="tabular-nums">{formatCount(facets.status.ALL)}</span>{" "}
      products
      {alerts.map(([stock, text, tone]) =>
        facets.stock[stock] ? (
          <span key={stock}>
            {" · "}
            <button
              aria-pressed={query.stock === stock}
              className={`${tone} cursor-pointer tabular-nums underline decoration-current/40 underline-offset-3 hover:decoration-current`}
              onClick={() =>
                update({ stock: query.stock === stock ? undefined : stock })
              }
              type="button"
            >
              {text}
            </button>
          </span>
        ) : null,
      )}
    </p>
  );
}

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="bg-muted inline-flex h-7 items-center gap-1 rounded-full pr-1 pl-3 text-xs font-medium">
      {text}
      <Button
        aria-label={`Remove ${text}`}
        className="size-5 rounded-full"
        onClick={onRemove}
        size="icon-xs"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </span>
  );
}

export function ProductsToolbar({
  categories,
  facets,
  query,
}: {
  categories: { id: string; name: string }[];
  facets: ProductModel.facets;
  query: ProductsQuery;
}) {
  const update = useUpdateQuery(query);
  const prefetch = usePrefetchQuery(query);
  const prefetchStatus = (status: string) =>
    prefetch({ status: STATUSES.find((s) => s === status) });

  const [, startTransition] = useTransition();
  const [tab, setTab] = useOptimistic(query.status ?? "ALL");
  const [name, setName] = useState(query.name ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !target.closest("input, textarea, select")) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const chips = [
    query.name ? (
      <Chip
        key="name"
        onRemove={() => {
          setName("");
          update({ name: undefined });
        }}
        text={`Search: “${query.name}”`}
      />
    ) : null,
    ...(query.categories ?? []).map((category) => (
      <Chip
        key={category}
        onRemove={() => {
          const next = query.categories?.filter((c) => c !== category);
          update({ categories: next?.length ? next : undefined });
        }}
        text={`Category: ${category}`}
      />
    )),
    query.stock ? (
      <Chip
        key="stock"
        onRemove={() => update({ stock: undefined })}
        text={`Stock: ${STOCK_LABELS[query.stock]}`}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-keyshortcuts="/"
            aria-label="Search products"
            className="bg-card pr-8 pl-8"
            name="search"
            onChange={(e) => {
              setName(e.target.value);
              clearTimeout(debounce.current);
              const next = e.target.value.trim() || undefined;
              debounce.current = setTimeout(() => update({ name: next }), 300);
            }}
            placeholder="Search products…"
            ref={search}
            type="search"
            value={name}
          />
          <kbd className="text-muted-foreground bg-card pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 font-mono text-[11px]">
            /
          </kbd>
        </div>
        <ToggleGroup
          aria-label="Status"
          className="bg-muted p-0.5"
          onValueChange={([value]) => {
            if (!value) {
              return;
            }
            const next = STATUSES.find((s) => s === value);
            startTransition(async () => {
              setTab(next ?? "ALL");
              await update({ status: next });
            });
          }}
          spacing={0.5}
          value={[tab]}
        >
          {(["ALL", ...STATUSES] as const).map((status) => (
            <ToggleGroupItem
              className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground h-7 aria-pressed:shadow-xs"
              key={status}
              onFocus={() => prefetchStatus(status)}
              onPointerEnter={() => prefetchStatus(status)}
              value={status}
            >
              {label(status)}
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatCount(facets.status[status])}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <ListFilterIcon data-icon="inline-start" />
            Category
            {query.categories ? (
              <span className="tabular-nums">· {query.categories.length}</span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent className={MENU_CONTENT}>
            <CategoryFilter
              categories={categories}
              counts={facets.category}
              query={query}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <ArrowUpDownIcon data-icon="inline-start" />
            {SORTS[query.sortBy ?? "name"]}
          </DropdownMenuTrigger>
          <DropdownMenuContent className={MENU_CONTENT}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className={MENU_LABEL}>Sort</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  update({
                    sortBy: Object.keys(SORTS).find((key) => key === value) as
                      ProductsQuery["sortBy"] | undefined,
                  })
                }
                value={query.sortBy ?? "name"}
              >
                {Object.entries(SORTS).map(([key, text]) => (
                  <DropdownMenuRadioItem
                    className={MENU_ITEM}
                    key={key}
                    value={key}
                  >
                    {text}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  update({ sortDir: value === "desc" ? "desc" : "asc" })
                }
                value={query.sortDir ?? "asc"}
              >
                <DropdownMenuRadioItem className={MENU_ITEM} value="asc">
                  Ascending
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem className={MENU_ITEM} value="desc">
                  Descending
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-1.5">
        <ProductsSummary facets={facets} query={query} />
        {chips.length ? (
          <>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            {chips}
            <Button
              className="text-muted-foreground underline underline-offset-3"
              onClick={() => {
                setName("");
                update({
                  name: undefined,
                  categories: undefined,
                  stock: undefined,
                });
              }}
              size="xs"
              variant="link"
            >
              Clear All
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
