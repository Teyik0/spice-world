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
  }).onError("plugin", ({ error, problem }) => {
    if (error instanceof PrismaClientUnknownRequestError) {
      return problem("Internal Server Error", {
        message: "An unknown PrismaClientUnknownRequestError error occurred",
        code: "UNKNOWN",
      });
    }

    if (!(error instanceof PrismaClientKnownRequestError)) {
      // Let elysia handle the error if it's not a Prisma error
      return;
    }

    switch (error.code) {
      case "P2025": // Record not found
        return problem("Not Found", {
          message: `${entity} not found`,
          code: error.code,
        });

      case "P2002": {
        // Unique constraint violation
        const target = error.meta?.target as string[] | undefined;
        const modelName = error.meta?.modelName as string | undefined;

        if (!target || target.length === 0) {
          return problem("Conflict", {
            message: `${modelName || entity} already exists`,
            code: error.code,
          });
        }

        // Use actual model name if available, otherwise use entity parameter
        const actualEntity = modelName || entity;
        const fields = target.join(", ");
        return problem("Conflict", {
          message: `${actualEntity} with this ${fields} already exists`,
          code: error.code,
        });
      }

      case "P2003": // Foreign key constraint violation
        return problem("Bad Request", {
          message: `Related ${error.meta?.field_name || "entity"} does not exist`,
          code: error.code,
        });

      case "P2000": // Value too long
        return problem("Bad Request", {
          message: `Input value too long for field ${error.meta?.target || ""}`,
          code: error.code,
        });

      default: // Unhandled error
        return problem("Internal Server Error", {
          message: error.message,
          code: error.code,
        });
    }
  });
