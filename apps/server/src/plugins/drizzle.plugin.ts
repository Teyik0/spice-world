import { SQL } from "bun";
import { DrizzleQueryError } from "drizzle-orm";
import { Elysia } from "elysia";

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

  switch (postgresError?.errno) {
    case "40001":
    case "40P01":
      return problem("Service Unavailable", {
        code: "DATABASE_WRITE_UNAVAILABLE",
        detail: "Database operation temporarily unavailable",
      });
    case "22021": // character_not_in_repertoire: Postgres rejects \0
      return problem("Bad Request", {
        code: "INVALID_TEXT",
        detail: "Invalid text value",
      });
    default:
      return problem("Internal Server Error", {
        code: "DATABASE_FAILURE",
        detail: "An unexpected database error occurred",
      });
  }
});
