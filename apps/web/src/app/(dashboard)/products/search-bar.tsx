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
} from "./search-params";

interface Category {
	id: string;
	name: string;
}

export function ProductsSearchBar({ categories }: { categories: Category[] }) {
	const [searchParams, setSearchParams] = useQueryStates(productsSearchParams, {
		shallow: false,
	});

	const debouncedSearch = useDebouncedCallback((name: string) => {
		setSearchParams({ name, skip: 0 });
	}, 300);

	const handleStatusChange = (status: string | null) => {
		const validStatus = productStatusOptions.find((s) => s === status);
		setSearchParams({ status: validStatus ?? null, skip: 0 });
	};

	const handleCategoryToggle = (categoryName: string) => {
		const current = searchParams.categories ?? [];
		const newCategories = current.includes(categoryName)
			? current.filter((c) => c !== categoryName)
			: [...current, categoryName];
		setSearchParams({
			categories: newCategories.length > 0 ? newCategories : null,
			skip: 0,
		});
	};

	const handleSortByChange = (
		sortBy: (typeof sortByOptions)[number] | null,
	) => {
		setSearchParams({ sortBy: sortBy ?? "name" });
	};

	const handleSortDirToggle = () => {
		setSearchParams({
			sortDir: searchParams.sortDir === "asc" ? "desc" : "asc",
		});
	};

	const handleClearFilters = () => {
		setSearchParams({
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
		price: "Price",
	};

	return (
		<ButtonGroup className="w-full">
			<Input
				placeholder="Search products..."
				defaultValue={searchParams.name}
				onChange={(e) => debouncedSearch(e.target.value)}
			/>
			<Button variant="outline" aria-label="Search">
				<SearchIcon />
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" className="pl-2 relative">
						<ChevronDownIcon />
						{hasActiveFilters && (
							<span className="absolute -top-1 -right-1 size-2 bg-primary rounded-full" />
						)}
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuLabel className="flex items-center gap-2">
						<FilterIcon className="size-4" />
						Filters
					</DropdownMenuLabel>
					<DropdownMenuSeparator />

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							Status
							{searchParams.status && (
								<span className="ml-auto text-xs text-muted-foreground">
									{searchParams.status.toLowerCase()}
								</span>
							)}
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={searchParams.status ?? ""}
									onValueChange={(v) => handleStatusChange(v || null)}
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
									<span className="ml-auto text-xs text-muted-foreground">
										{searchParams.categories.length}
									</span>
								)}
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuGroup>
									{categories.map((category) => (
										<DropdownMenuItem
											key={category.id}
											onSelect={(e) => e.preventDefault()}
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
							<span className="ml-auto text-xs text-muted-foreground">
								{sortByLabels[searchParams.sortBy]}
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={searchParams.sortBy}
									onValueChange={(v) =>
										handleSortByChange(v as (typeof sortByOptions)[number])
									}
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

					{hasActiveFilters && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={handleClearFilters}>
								<XIcon className="mr-2 size-4" />
								Clear all filters
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
