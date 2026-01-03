"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { app } from "@spice-world/web/lib/elysia";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { productsSearchParams } from "./search-params";

const PAGE_SIZE = 25;

export function useProductsInfinite(initialData?: ProductModel.getResult) {
	const [params] = useQueryStates(productsSearchParams);

	return useInfiniteQuery({
		queryKey: [
			"products",
			params.name,
			params.status,
			params.categories,
			params.sortBy,
			params.sortDir,
		],
		queryFn: async ({ pageParam }) => {
			const { data } = await app.products.get({
				query: {
					name: params.name || undefined,
					skip: pageParam,
					take: PAGE_SIZE,
					status: params.status ?? undefined,
					categories: params.categories ?? undefined,
					sortBy: params.sortBy,
					sortDir: params.sortDir,
				},
			});
			return data ?? [];
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (lastPage.length < PAGE_SIZE) return undefined;
			return allPages.length * PAGE_SIZE;
		},
		initialData: initialData
			? { pages: [initialData], pageParams: [0] }
			: undefined,
	});
}
