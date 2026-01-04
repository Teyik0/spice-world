"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { app } from "@spice-world/web/lib/elysia";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useInView } from "react-intersection-observer";
import { productsSearchParams } from "../search-params";
import { INITIAL_PAGE_SIZE } from "./default";

export const PAGE_SIZE = 25;

export function useProductsInfinite(initialProducts: ProductModel.getResult) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [ref, inView] = useInView({ threshold: 0 });
	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			ref(node);
			scrollRef.current = node;
		},
		[ref],
	);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const [params] = useQueryStates(productsSearchParams);
	const refParams = useRef(params);
	const [pages, setPages] = useState<ProductModel.getResult[]>([
		initialProducts,
	]);
	const [hasNextPage, setHasNextPage] = useState(
		initialProducts.length >= PAGE_SIZE,
	);

	useEffect(() => {
		const hasParamsChanged = refParams.current !== params;
		if (!hasParamsChanged) return;
		app.products
			.get({
				query: {
					name: params.name || undefined,
					skip: 0,
					take: INITIAL_PAGE_SIZE,
					status: params.status ?? undefined,
					categories: params.categories ?? undefined,
					sortBy: params.sortBy,
					sortDir: params.sortDir,
				},
			})
			.then(({ data }) => {
				setPages([data ?? []]);
				setHasNextPage(data ? data.length >= PAGE_SIZE : false);
				scrollContainerRef?.current?.scrollTo({ top: 0, behavior: "smooth" });
			});

		refParams.current = params;
	}, [params]);

	const [isFetchingNextPage, startTransition] = useTransition();
	const fetchNextPage = useCallback(async () => {
		if (isFetchingNextPage || !hasNextPage) return;
		startTransition(async () => {
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
		});
	}, [isFetchingNextPage, hasNextPage, pages.length, params]);

	useEffect(() => {
		if (inView && hasNextPage) fetchNextPage();
	}, [inView, hasNextPage, fetchNextPage]);

	return {
		products: pages.flat(),
		isFetching: isFetchingNextPage,
		ref: setRef,
		containerRef: scrollContainerRef,
	};
}
