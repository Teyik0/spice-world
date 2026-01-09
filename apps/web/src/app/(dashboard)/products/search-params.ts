import {
	createParser,
	createSearchParamsCache,
	parseAsArrayOf,
	parseAsIndex,
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

function parseAsIntegerMax(max: number) {
	return createParser({
		parse(queryValue: string) {
			const n = Number(queryValue);
			if (!Number.isInteger(n)) return null;
			return Math.min(Math.max(n, 1), max);
		},
		serialize: parseAsInteger.serialize,
	});
}

export const INITIAL_PAGE_SIZE = 25;

export const productsSearchParams = {
	name: parseAsString.withDefault(""),
	skip: parseAsIndex.withDefault(0),
	take: parseAsIntegerMax(100).withDefault(INITIAL_PAGE_SIZE),
	status: parseAsStringLiteral(productStatusOptions),
	categories: parseAsArrayOf(parseAsString),
	sortBy: parseAsStringLiteral(sortByOptions).withDefault("name"),
	sortDir: parseAsStringLiteral(sortDirOptions).withDefault("asc"),
};

export const productsSearchParamsCache =
	createSearchParamsCache(productsSearchParams);
