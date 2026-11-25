// biome-ignore-all lint/suspicious/noExplicitAny: advanced types gestion
import { treaty } from "@elysia/eden";
import type { App } from "@spice-world/server/index";

import { env, type unknownError } from "./utils";

// Browser twin (see elysia-server.ts for the RSC twin): cookies are attached
// by credentials: "include" itself. Client-safe: never import next/headers here
// or every client bundle pulling this module fails to build.
export const app = treaty<App>(env.NEXT_PUBLIC_BETTER_AUTH_URL, {
  fetch: {
    credentials: "include", // automatic includes cookies in requests
    cache: "no-store", // disable Next.js cache for fetch requests
  },
});

type TreatyMethod = (...args: any[]) => Promise<{
  data: any;
  error: any;
}>;

type TreatyMethodError<T extends TreatyMethod> = Awaited<
  ReturnType<T>
>["error"];

type RouteErrors<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends TreatyMethod ? TreatyMethodError<T[K]> : never;
}[keyof T];

// This gives error types for : Post | Patch | Delete | Get
export type CategoryErrors =
  | RouteErrors<typeof app.categories>
  | RouteErrors<ReturnType<typeof app.categories>>;
export type ProductErrors =
  | RouteErrors<typeof app.products>
  | RouteErrors<typeof app.products.bulk>
  | RouteErrors<ReturnType<typeof app.products>>;
export type AttributeErrors =
  | RouteErrors<typeof app.attributes>
  | RouteErrors<ReturnType<typeof app.attributes>>;
export type CollectionErrors =
  | RouteErrors<typeof app.collections>
  | RouteErrors<ReturnType<typeof app.collections>>;

// Used to type Elysia errors in the frontend at components/elysia-error.tsx
export type ElysiaAppError =
  CategoryErrors | ProductErrors | AttributeErrors | CollectionErrors;

export const elysiaErrorToString = (
  error: NonNullable<ElysiaAppError> | ReturnType<typeof unknownError>,
) => {
  if (typeof error.value === "string") {
    return error.value;
  }
  if ("message" in error.value) {
    return error.value.message;
  }
  return ("detail" in error.value && error.value.detail) || error.value.title;
};
