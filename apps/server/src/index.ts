import { opentelemetry } from "@elysiajs/opentelemetry";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { attributeRouter } from "./routes/attribute.router";
import { categoryRouter } from "./routes/category.router";
import { productsRouter } from "./routes/product.router";
import { tagRouter } from "./routes/tag.router";

const app = new Elysia()
  .use(opentelemetry())
  .use(swagger({ path: "/api/v1/docs" }))
  .onTransform(({ body, params, path, request: { method } }) => {
    console.log(
      `${new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })} - ${method} ${path}`,
      {
        body,
        params,
      },
    );
  })
  .all("/api/auth/*", "TO-DO AUTH HANDLER")
  .use(tagRouter)
  .use(categoryRouter)
  .use(productsRouter)
  .use(attributeRouter)
  .listen(3000);

export type App = typeof app;

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
