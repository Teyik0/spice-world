"use client";

import { app } from "@spice-world/web/lib/elysia";
import { useAtom } from "jotai";
import { useQueryStates } from "nuqs";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { useInView } from "react-intersection-observer";
import { INITIAL_PAGE_SIZE, productsSearchParams } from "../search-params";
import { productPagesAtom } from "../store";

export function useProductsInfinite() {
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
	const paramsKey = useMemo(() => JSON.stringify(params), [params]);
	const refParams = useRef(paramsKey);

	const [pages, setPages] = useAtom(productPagesAtom);
	const [hasNextPage, setHasNextPage] = useState(
		pages[0] ? pages[0]?.length >= INITIAL_PAGE_SIZE : false,
	);

	useEffect(() => {
		const hasParamsChanged = refParams.current === paramsKey;
		if (hasParamsChanged) return;
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
				setHasNextPage(data ? data.length >= INITIAL_PAGE_SIZE : false);
				scrollContainerRef?.current?.scrollTo({ top: 0, behavior: "smooth" });
			});

		refParams.current = paramsKey;
	}, [paramsKey, params, setPages]);

	const [isFetchingNextPage, startTransition] = useTransition();
	const fetchNextPage = useCallback(async () => {
		if (isFetchingNextPage || !hasNextPage) return;
		startTransition(async () => {
			const skip = pages.length * INITIAL_PAGE_SIZE;
			const { data } = await app.products.get({
				query: {
					name: params.name || undefined,
					skip,
					take: INITIAL_PAGE_SIZE,
					status: params.status ?? undefined,
					categories: params.categories ?? undefined,
					sortBy: params.sortBy,
					sortDir: params.sortDir,
				},
			});

			const newPage = data ?? [];
			setPages((prev) => [...prev, newPage]);
			setHasNextPage((prev) =>
				prev === newPage.length >= INITIAL_PAGE_SIZE
					? prev
					: newPage.length >= INITIAL_PAGE_SIZE,
			);
		});
	}, [isFetchingNextPage, hasNextPage, pages.length, params, setPages]);

	useEffect(() => {
		if (inView && hasNextPage) fetchNextPage();
	}, [inView, hasNextPage, fetchNextPage]);

	const products = useMemo(() => pages.flat(), [pages]);

	return {
		products,
		isFetching: isFetchingNextPage,
		ref: setRef,
		containerRef: scrollContainerRef,
	};
}
