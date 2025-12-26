import { Elysia } from "elysia";
import {
	PrismaClientKnownRequestError,
	PrismaClientUnknownRequestError,
} from "../prisma/internal/prismaNamespace";

export type Entity =
	| "Category"
	| "Product"
	| "User"
	| "Attribute"
	| "AttributeValue"
	| "Image"
	| "Order";

export const prismaErrorPlugin = (entity: Entity) =>
	new Elysia({
		name: "prisma-error-handler",
	}).onError({ as: "scoped" }, ({ error, status }) => {
		if (error instanceof PrismaClientUnknownRequestError) {
			console.error("PrismaClientUnknownRequestError ->", error);
			return status("Internal Server Error", {
				message: "An unknown PrismaClientUnknownRequestError error occurred",
				code: "UNKNOWN",
			});
		}

		if (!(error instanceof PrismaClientKnownRequestError)) {
			// Let elysia handle the error if it's not a Prisma error
			return;
		}

		// Handle different Prisma error codes
		switch (error.code) {
			case "P2025": // Record not found
				return status("Not Found", {
					message: `${entity} not found`,
					code: error.code,
				});

			case "P2002": {
				// Unique constraint violation
				const field = (error.meta?.target as string[]) || ["field"];
				return status("Conflict", {
					message: `${entity} with this ${field.join(", ")} already exists`,
					code: error.code,
				});
			}

			case "P2003": // Foreign key constraint violation
				return status(
					"Bad Request",
					`Related ${error.meta?.field_name || "entity"} does not exist`,
				);

			case "P2000": // Value too long
				return status("Bad Request", {
					message: `Input value too long for field ${error.meta?.target || ""}`,
					code: error.code,
				});

			default: // Unhandled error
				console.error(error);
				return status("Internal Server Error", {
					message: error.message,
					code: error.code,
				});
		}
	});
