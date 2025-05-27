import { Slot, component$ } from "@qwik.dev/core";
import type { RequestHandler } from "@qwik.dev/router";
import { Toaster } from "qwik-sonner";

export const onGet: RequestHandler = async ({ cacheControl }) => {
  cacheControl({
    public: false,
    maxAge: 0,
    sMaxAge: 0,
    staleWhileRevalidate: 0,
  });
};

export default component$(() => {
  return (
    <>
      <Toaster position="bottom-right" richColors />
      <Slot />
    </>
  );
});
