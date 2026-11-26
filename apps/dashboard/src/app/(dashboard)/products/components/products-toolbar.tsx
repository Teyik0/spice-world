import { Button } from "@spice-world/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@spice-world/ui/components/dropdown-menu";
import { Input } from "@spice-world/ui/components/input";
import { useNavigate } from "@teyik0/furin/link";
import { ArrowUpDownIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import type { ProductsQuery } from "./products-query";
import { STATUSES } from "./products-query";

const SORTS = {
  name: "Name",
  createdAt: "Created",
  updatedAt: "Updated",
  priceMin: "Lowest Price",
  priceMax: "Highest Price",
} satisfies Record<NonNullable<ProductsQuery["sortBy"]>, string>;

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

export function ProductsToolbar({
  categories,
  query,
}: {
  categories: { id: string; name: string }[];
  query: ProductsQuery;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(query.name ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = (patch: Partial<ProductsQuery>) =>
    navigate({
      to: "/products",
      search: { ...query, ...patch },
      replace: true,
    });
  const picked = new Set(query.categories);
  const filtered = Boolean(query.name || query.status || query.categories);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Search products"
        className="w-full sm:max-w-xs"
        name="search"
        onChange={(e) => {
          setName(e.target.value);
          clearTimeout(debounce.current);
          const next = e.target.value.trim() || undefined;
          debounce.current = setTimeout(() => update({ name: next }), 300);
        }}
        placeholder="Search products…"
        type="search"
        value={name}
      />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Status: {query.status ? label(query.status) : "All"}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            onValueChange={(value) =>
              update({ status: STATUSES.find((s) => s === value) })
            }
            value={query.status ?? "ALL"}
          >
            <DropdownMenuRadioItem value="ALL">All</DropdownMenuRadioItem>
            {STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                {label(status)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Categories{picked.size ? ` (${picked.size})` : ""}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80">
          <DropdownMenuGroup>
            {categories.map(({ id, name: category }) => (
              <DropdownMenuCheckboxItem
                checked={picked.has(category)}
                key={id}
                onCheckedChange={(checked) => {
                  const next = new Set(picked);
                  if (checked) {
                    next.add(category);
                  } else {
                    next.delete(category);
                  }
                  update({ categories: next.size ? [...next] : undefined });
                }}
              >
                {category}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <ArrowUpDownIcon data-icon="inline-start" />
          {SORTS[query.sortBy ?? "name"]}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort By</DropdownMenuLabel>
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
                <DropdownMenuRadioItem key={key} value={key}>
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
              <DropdownMenuRadioItem value="asc">
                Ascending
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">
                Descending
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {filtered ? (
        <Button
          onClick={() => {
            setName("");
            update({
              name: undefined,
              status: undefined,
              categories: undefined,
            });
          }}
          variant="ghost"
        >
          <XIcon data-icon="inline-start" />
          Clear Filters
        </Button>
      ) : null}
    </div>
  );
}
