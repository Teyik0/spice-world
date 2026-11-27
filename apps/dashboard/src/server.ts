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

// Read by the compiled Bun entry when PORT is unset.
export const port = Number(Bun.env.PORT ?? 5174);

if (import.meta.main) {
  app.listen(port, () => {
    console.info(`Spice World dashboard : http://localhost:${port}`);
  });
}
export default app;
