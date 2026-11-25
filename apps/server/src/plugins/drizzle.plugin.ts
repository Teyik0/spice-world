import { SQL } from "bun";
import { DrizzleQueryError } from "drizzle-orm";
import { Elysia } from "elysia";
import type { ConstraintFailure } from "../lib/db";
import { attributeConstraintFailures } from "../modules/attributes/errors";
import { categoryConstraintFailures } from "../modules/categories/errors";
import { collectionConstraintFailures } from "../modules/collections/errors";

const constraintFailures = new Map<string, ConstraintFailure>([
  ...attributeConstraintFailures,
  ...categoryConstraintFailures,
  ...collectionConstraintFailures,
]);

function getPostgresError(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;

  return cause instanceof SQL.PostgresError ? cause : undefined;
}

export const drizzleErrorPlugin = new Elysia({
  name: "drizzle-error-handler",
}).onError("plugin", ({ error, problem }) => {
  const postgresError = getPostgresError(error);

  if (!(postgresError || error instanceof DrizzleQueryError)) {
    return;
  }

  const constraintFailure = postgresError?.constraint
    ? constraintFailures.get(
        `${postgresError.errno}:${postgresError.constraint}`,
      )
    : undefined;

  if (constraintFailure) {
    return problem(constraintFailure.status, {
      code: constraintFailure.code,
      message: constraintFailure.message,
    });
  }

  switch (postgresError?.errno) {
    case "40001":
    case "40P01":
      return problem("Service Unavailable", {
        code: "DATABASE_WRITE_UNAVAILABLE",
        message: "Database operation temporarily unavailable",
      });
    default:
      return problem("Internal Server Error", {
        code: "UNKNOWN",
        message: "An unexpected database error occurred",
      });
  }
});
