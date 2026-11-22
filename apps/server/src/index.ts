import "@spice-world/server/lib/env";
import { cors } from "@elysia/cors";
import { opentelemetry } from "@elysia/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { env } from "@spice-world/server/lib/env";
import { attributeRouter } from "@spice-world/server/modules/attributes";
import { categoryRouter } from "@spice-world/server/modules/categories";
import { collectionRouter } from "@spice-world/server/modules/collections";
import { ordersRouter } from "@spice-world/server/modules/orders";
import { productsRouter } from "@spice-world/server/modules/products";
import { Elysia, setFileTypeDetector } from "elysia";
import { fileTypeFromBlob } from "file-type";
import { betterAuthPlugin } from "./plugins/auth.plugin.tsx";

setFileTypeDetector(fileTypeFromBlob);

const formattedDate = () =>
  new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const requestStart = new WeakMap<Request, number>();

const app = new Elysia()
  .use(
    opentelemetry({
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: "https://api.axiom.co/v1/traces",
            headers: {
              Authorization: `Bearer ${env.AXIOM_TOKEN}`,
              "X-Axiom-Dataset": "spice-world",
            },
          })
        ),
      ],
    })
  )
  .use(
    cors({
      origin: ["http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .onRequest(({ request }) => {
    requestStart.set(request, performance.now());
  })
  .onTransform(({ body, params, path, request: { method } }) => {
    console.log(`${formattedDate()} - ${method} ${path}`, {
      body,
      params,
    });
  })
  .use(betterAuthPlugin)
  .guard({
    access: "optional",
  })
  .onAfterResponse(({ user, path, request, set }) => {
    console.log(`${formattedDate()} - RESPONSE ${path}`, {
      performance: `${(
        performance.now() - (requestStart.get(request) ?? performance.now())
      ).toFixed(2)} ms`,
      status: set.status,
      user: user ? user.id : "anonymous",
    });
  })
  .onBeforeHandle(({ request, user, problem }) => {
    if (request.method !== "GET" && user?.role !== "admin") {
      return problem("Unauthorized", {
        detail: "You need to be admin to perform this action",
      });
    }
  })
  .use(categoryRouter)
  .use(collectionRouter)
  .use(attributeRouter)
  .use(productsRouter)
  .use(ordersRouter)
  .listen(Bun.env.PORT ?? 3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
export type App = typeof app;
