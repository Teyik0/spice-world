import {
	createSearchParamsCache,
	parseAsArrayOf,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";

export const productStatusOptions = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const sortByOptions = [
	"name",
	"createdAt",
	"updatedAt",
	"priceMin",
	"priceMax",
] as const;
export const sortDirOptions = ["asc", "desc"] as const;

export const productsSearchParams = {
	name: parseAsString.withDefault(""),
	skip: parseAsInteger.withDefault(0),
	take: parseAsInteger.withDefault(100),
	status: parseAsStringLiteral(productStatusOptions),
	categories: parseAsArrayOf(parseAsString),
	sortBy: parseAsStringLiteral(sortByOptions).withDefault("name"),
	sortDir: parseAsStringLiteral(sortDirOptions).withDefault("asc"),
};

export const productsSearchParamsCache =
	createSearchParamsCache(productsSearchParams);
