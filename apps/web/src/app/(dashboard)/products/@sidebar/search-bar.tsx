"use client";

import { Button } from "@spice-world/web/components/ui/button";
import { ButtonGroup } from "@spice-world/web/components/ui/button-group";
import { Checkbox } from "@spice-world/web/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import { Input } from "@spice-world/web/components/ui/input";
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  ChevronDownIcon,
  FilterIcon,
  SearchIcon,
  SortAscIcon,
  XIcon,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { useDebouncedCallback } from "use-debounce";
import {
  productStatusOptions,
  productsSearchParams,
  sortByOptions,
} from "../search-params";

interface Category {
  id: string;
  name: string;
}

export function ProductsSearchBar({ categories }: { categories: Category[] }) {
  const [searchParams, setSearchParams] = useQueryStates(productsSearchParams);

  const debouncedSearch = useDebouncedCallback(async (name: string) => {
    await setSearchParams({ name, skip: 0 });
  }, 300);

  const handleStatusChange = async (status: string | null) => {
    const validStatus = productStatusOptions.find((s) => s === status);
    await setSearchParams({ status: validStatus ?? null, skip: 0 });
  };

  const handleCategoryToggle = async (categoryName: string) => {
    const current = searchParams.categories ?? [];
    const newCategories = current.includes(categoryName)
      ? current.filter((c) => c !== categoryName)
      : [...current, categoryName];
    await setSearchParams({
      categories: newCategories.length > 0 ? newCategories : null,
      skip: 0,
    });
  };

  const handleSortByChange = async (
    sortBy: (typeof sortByOptions)[number] | null
  ) => {
    await setSearchParams({ sortBy: sortBy ?? "name" });
  };

  const handleSortDirToggle = async () => {
    await setSearchParams({
      sortDir: searchParams.sortDir === "asc" ? "desc" : "asc",
    });
  };

  const handleClearFilters = async () => {
    await setSearchParams({
      name: "",
      status: null,
      categories: null,
      sortBy: "name",
      sortDir: "asc",
      skip: 0,
    });
  };

  const hasActiveFilters =
    searchParams.name ||
    searchParams.status ||
    (searchParams.categories && searchParams.categories.length > 0) ||
    searchParams.sortBy !== "name" ||
    searchParams.sortDir !== "asc";

  const sortByLabels: Record<(typeof sortByOptions)[number], string> = {
    name: "Name",
    createdAt: "Created",
    updatedAt: "Updated",
    priceMin: "Price (min)",
    priceMax: "Price (max)",
  };

  return (
    <ButtonGroup className="w-full">
      <Input
        defaultValue={searchParams.name}
        onChange={(e) => debouncedSearch(e.target.value)}
        placeholder="Search products..."
      />
      <Button aria-label="Search" variant="outline">
        <SearchIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="relative pl-2" variant="outline">
              <ChevronDownIcon />
              {hasActiveFilters ? (
                <span className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
              ) : null}
            </Button>
          }
        />

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2">
              <FilterIcon className="size-4" />
              Filters
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Status
                {searchParams.status ? (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {searchParams.status.toLowerCase()}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(v) => handleStatusChange(v || null)}
                    value={searchParams.status ?? ""}
                  >
                    <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
                    {productStatusOptions.map((status) => (
                      <DropdownMenuRadioItem key={status} value={status}>
                        {status.charAt(0) + status.slice(1).toLowerCase()}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Categories
                {searchParams.categories &&
                  searchParams.categories.length > 0 && (
                    <span className="text-muted-foreground ml-auto text-xs">
                      {searchParams.categories.length}
                    </span>
                  )}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuGroup>
                    {categories.map((category) => (
                      <DropdownMenuItem
                        closeOnClick={false}
                        key={category.id}
                        onClick={() => handleCategoryToggle(category.name)}
                      >
                        <Checkbox
                          checked={
                            searchParams.categories?.includes(category.name) ??
                            false
                          }
                          className="mr-2"
                        />
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="flex items-center gap-2">
              <SortAscIcon className="size-4" />
              Sort
            </DropdownMenuLabel>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Sort by
                <span className="text-muted-foreground ml-auto text-xs">
                  {sortByLabels[searchParams.sortBy]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(v) =>
                      handleSortByChange(v as (typeof sortByOptions)[number])
                    }
                    value={searchParams.sortBy}
                  >
                    {sortByOptions.map((option) => (
                      <DropdownMenuRadioItem key={option} value={option}>
                        {sortByLabels[option]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem onClick={handleSortDirToggle}>
              {searchParams.sortDir === "asc" ? (
                <>
                  <ArrowDownAZIcon className="mr-2 size-4" />
                  Ascending
                </>
              ) : (
                <>
                  <ArrowUpAZIcon className="mr-2 size-4" />
                  Descending
                </>
              )}
            </DropdownMenuItem>

            {hasActiveFilters ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleClearFilters}>
                  <XIcon className="mr-2 size-4" />
                  Clear all filters
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
