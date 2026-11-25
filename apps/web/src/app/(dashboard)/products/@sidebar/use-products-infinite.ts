"use client";

import { app } from "@spice-world/web/lib/elysia";
import { useAtom } from "jotai";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useTransition } from "react";
import { useInView } from "react-intersection-observer";

import {
  INITIAL_PAGE_SIZE,
  productsSearchParams,
  toProductsQuery,
} from "../search-params";
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

  const [pages, setPages] = useAtom(productPagesAtom);

  // Page 0 comes from the server (default.tsx -> ProductsHydrator re-hydrates
  // this atom on every searchParams change). hasNextPage derives from the last
  // page so it stays correct across server re-hydrations.
  const hasNextPage = (pages.at(-1)?.length ?? 0) >= INITIAL_PAGE_SIZE;

  // Filter changes are server-driven: nuqs updates the URL, the RSC slot
  // refetches and re-hydrates the atom. The client only resets the scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: paramsKey is the change trigger, not a value read
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [paramsKey]);

  // The only client fetch left: pages after the first one (infinite scroll).
  const [isFetchingNextPage, startTransition] = useTransition();
  const fetchNextPage = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage) {
      return;
    }
    startTransition(async () => {
      const { data } = await app.products.get({
        query: toProductsQuery(params, pages.length * INITIAL_PAGE_SIZE),
      });

      setPages((prev) => [...prev, data ?? []]);
    });
  }, [isFetchingNextPage, hasNextPage, pages.length, params, setPages]);

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  const products = useMemo(() => pages.flat(), [pages]);

  return {
    products,
    isFetching: isFetchingNextPage,
    ref: setRef,
    containerRef: scrollContainerRef,
  };
}
