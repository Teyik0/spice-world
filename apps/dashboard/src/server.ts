import { furin } from "@teyik0/furin";
import { Elysia } from "elysia";

const app = new Elysia().use(await furin({ style: "nextjs" }));

if (import.meta.main) {
  app.listen(Number(process.env.PORT ?? 5174), ({ port }) => {
    console.info(`Spice World dashboard : http://localhost:${port}`);
  });
}
export default app;
