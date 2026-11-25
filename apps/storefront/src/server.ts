import { furin, revalidateTag } from "@teyik0/furin";
import { Elysia, t } from "elysia";

import { api } from "./lib/api";

const app = new Elysia()
  .post(
    "/_revalidate",
    { query: t.Object({ tag: t.String({ minLength: 1 }) }) },
    async ({ headers, query, status }) => {
      const secret = process.env.REVALIDATE_SECRET;
      if (!secret || headers.authorization !== `Bearer ${secret}`) {
        return status(401, "Unauthorized");
      }
      return { revalidated: await revalidateTag(query.tag) };
    },
  )
  // "voir plus d'avis": the browser never talks to the API directly
  .get(
    "/_avis/:id",
    { query: t.Object({ skip: t.Number({ minimum: 0 }) }) },
    async ({ params: { id }, query: { skip }, status }) => {
      const { data, error } = await api
        .products({ id })
        .comments.get({ query: { skip } });
      return error ? status(error.status, error.value) : data;
    },
  )
  .use(await furin({ style: "nextjs" }));

if (import.meta.main) {
  app.listen(Number(process.env.PORT ?? 4172), ({ port }) => {
    console.info(`Spice World : http://localhost:${port}`);
  });
}
export default app;
