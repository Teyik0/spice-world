"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { app } from "@spice-world/web/lib/elysia";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { productsSearchParams } from "../search-params";

export const PAGE_SIZE = 25;

export function useProductsInfinite(initialProducts: ProductModel.getResult) {
	const [params] = useQueryStates(productsSearchParams);
	const [pages, setPages] = useState<ProductModel.getResult[]>([
		initialProducts,
	]);
	const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
	const [hasNextPage, setHasNextPage] = useState(
		initialProducts.length >= PAGE_SIZE,
	);

	const paramsKey = JSON.stringify([
		params.name,
		params.status,
		params.categories,
		params.sortBy,
		params.sortDir,
	]);
	const prevParamsKey = useRef(paramsKey);
	const prevInitialProducts = useRef(initialProducts);

	useEffect(() => {
		const paramsChanged = prevParamsKey.current !== paramsKey;
		const initialDataChanged = prevInitialProducts.current !== initialProducts;

		if (paramsChanged || initialDataChanged) {
			setPages([initialProducts]);
			setHasNextPage(initialProducts.length >= PAGE_SIZE);
			prevParamsKey.current = paramsKey;
			prevInitialProducts.current = initialProducts;
		}
	}, [paramsKey, initialProducts]);

	const fetchNextPage = useCallback(async () => {
		if (isFetchingNextPage || !hasNextPage) return;

		setIsFetchingNextPage(true);
		try {
			const skip = pages.length * PAGE_SIZE;
			const { data } = await app.products.get({
				query: {
					name: params.name || undefined,
					skip,
					take: PAGE_SIZE,
					status: params.status ?? undefined,
					categories: params.categories ?? undefined,
					sortBy: params.sortBy,
					sortDir: params.sortDir,
				},
			});

			const newPage = data ?? [];
			setPages((prev) => [...prev, newPage]);
			setHasNextPage(newPage.length >= PAGE_SIZE);
		} finally {
			setIsFetchingNextPage(false);
		}
	}, [isFetchingNextPage, hasNextPage, pages.length, params]);

	return {
		products: pages.flat(),
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	};
}
