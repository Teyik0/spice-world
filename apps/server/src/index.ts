import "@spice-world/server/lib/env";
import { cors } from "@elysiajs/cors";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { env } from "@spice-world/server/lib/env";
import { attributeRouter } from "@spice-world/server/modules/attributes";
import { categoryRouter } from "@spice-world/server/modules/categories";
import { ordersRouter } from "@spice-world/server/modules/orders";
import { productsRouter } from "@spice-world/server/modules/products";
import { Elysia } from "elysia";
import { betterAuthPlugin } from "./plugins/better-auth.plugin.tsx";

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

let startTime = performance.now();

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
					}),
				),
			],
		}),
	)
	.use(
		cors({
			origin: ["http://localhost:3000", "http://localhost:3001"],
			methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	)
	.onTransform(({ body, params, path, request: { method } }) => {
		startTime = performance.now();
		console.log(`${formattedDate()} - ${method} ${path}`, {
			body,
			params,
		});
	})
	.use(betterAuthPlugin)
	.guard({
		user: true,
	})
	.onAfterResponse(({ user, path, set }) => {
		console.log(`${formattedDate()} - RESPONSE ${path}`, {
			performance: `${(performance.now() - startTime).toFixed(2)} ms`,
			status: set.status,
			user: user ? user.id : "anonymous",
		});
	})
	.onBeforeHandle(({ request, user, status }) => {
		if (request.method !== "GET" && (!user || user.role !== "admin")) {
			return status(
				"Unauthorized",
				"You need to be admin to perform this action",
			);
		}
	})
	.use(categoryRouter)
	.use(attributeRouter)
	.use(productsRouter)
	.use(ordersRouter)
	.listen(Bun.env.PORT ?? 3001);

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
export type App = typeof app;
