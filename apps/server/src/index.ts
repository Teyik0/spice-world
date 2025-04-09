import { cors } from "@elysiajs/cors";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { betterAuthPlugin } from "./plugins/better-auth.plugin";
import { attributeRouter } from "./routes/attribute.router";
import { categoryRouter } from "./routes/category.router";
import { productsRouter } from "./routes/product.router";
import { tagRouter } from "./routes/tag.router";

const app = new Elysia()
	.use(opentelemetry())
	.use(
		cors({
			origin: "http://localhost:3000",
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	)
	.use(
		swagger({
			documentation: {
				info: {
					title: "Spice World Swagger API",
					version: "0.1.0",
				},
			},
			path: "/api/v1/swagger",
		}),
	)
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
	.use(betterAuthPlugin)
	.use(tagRouter)
	.use(categoryRouter)
	.use(attributeRouter)
	.use(productsRouter)
	.listen(3000);

export type App = typeof app;

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
