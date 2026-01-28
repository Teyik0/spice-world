import { Elysia } from "elysia";

export type Entity =
	| "Category"
	| "Product"
	| "User"
	| "Attribute"
	| "AttributeValue"
	| "Image"
	| "Order";

// PostgreSQL error codes
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_CODES = {
	UNIQUE_VIOLATION: "23505",
	FOREIGN_KEY_VIOLATION: "23503",
	NOT_NULL_VIOLATION: "23502",
	CHECK_VIOLATION: "23514",
	STRING_DATA_RIGHT_TRUNCATION: "22001",
} as const;

// Custom error class for "not found" cases
export class NotFoundError extends Error {
	code = "NOT_FOUND";
	entity: Entity;

	constructor(entity: Entity, message?: string) {
		super(message ?? `${entity} not found`);
		this.entity = entity;
		this.name = "NotFoundError";
	}
}

interface PostgresError extends Error {
	code?: string;
	constraint?: string;
	detail?: string;
	table?: string;
	column?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
	return error instanceof Error && "code" in error;
}

export const dbErrorPlugin = (entity: Entity) =>
	new Elysia({
		name: "db-error-handler",
	}).onError({ as: "scoped" }, ({ error, status }) => {
		// Handle custom NotFoundError
		if (error instanceof NotFoundError) {
			return status("Not Found", {
				message: error.message,
				code: "P2025", // Keep same code for API compatibility
			});
		}

		// Handle PostgreSQL errors
		if (!isPostgresError(error)) {
			return; // Let Elysia handle non-postgres errors
		}

		switch (error.code) {
			case PG_ERROR_CODES.UNIQUE_VIOLATION: {
				// Extract field name from constraint name or detail
				const constraintMatch = error.constraint?.match(
					/(?:_([^_]+)_key$|_([^_]+)_unique$)/,
				);
				const field = constraintMatch?.[1] || constraintMatch?.[2];

				// Extract table name from constraint or error
				const tableName = error.table || entity;

				if (field) {
					return status("Conflict", {
						message: `${tableName} with this ${field} already exists`,
						code: "P2002",
					});
				}

				return status("Conflict", {
					message: `${tableName} already exists`,
					code: "P2002",
				});
			}

			case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION: {
				// Extract referenced table from detail
				const detailMatch = error.detail?.match(
					/Key \(([^)]+)\)=\([^)]+\) is not present in table "([^"]+)"/,
				);
				const referencedTable = detailMatch?.[2] || "entity";

				return status("Bad Request", {
					message: `Related ${referencedTable} does not exist`,
					code: "P2003",
				});
			}

			case PG_ERROR_CODES.NOT_NULL_VIOLATION: {
				return status("Bad Request", {
					message: `${error.column || "Field"} cannot be null`,
					code: "P2011",
				});
			}

			case PG_ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION: {
				return status("Bad Request", {
					message: `Input value too long for field ${error.column || ""}`,
					code: "P2000",
				});
			}

			default:
				// Log unhandled database errors
				console.error("Unhandled database error:", error);
				return status("Internal Server Error", {
					message: error.message,
					code: error.code,
				});
		}
	});
