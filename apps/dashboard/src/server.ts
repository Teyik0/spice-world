import { furin } from "@teyik0/furin";
import { Elysia } from "elysia";

import { env } from "./lib/env";

const app = new Elysia()
  .all("/api/*", ({ request }) => {
    const { pathname, search } = new URL(request.url);
    const path = pathname.startsWith("/api/auth/")
      ? pathname
      : pathname.slice(4);
    return fetch(new Request(`${env.API_URL}${path}${search}`, request), {
      decompress: false,
    });
  })
  .use(await furin({ style: "nextjs" }));

if (import.meta.main) {
  app.listen(Number(process.env.PORT ?? 5174), ({ port }) => {
    console.info(`Spice World dashboard : http://localhost:${port}`);
  });
}
export default app;
