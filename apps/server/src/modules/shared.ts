import { status, t } from "elysia";
import type { UploadFileResult } from "uploadthing/types";

type HttpStatus =
	| "Bad Request"
	| "Not Found"
	| "Conflict"
	| "Unauthorized"
	| "Forbidden"
	| "Internal Server Error";

export interface ValidationError {
	code: string;
	message: string;
	httpStatus?: HttpStatus;
	field?: string;
	details?: {
		// Invalid input value
		invalidValue?: unknown;
		// For capacity/limit violations
		constraints?: {
			current: number;
			maximum?: number;
			minimum?: number;
		};
		// For conflicts/duplicates
		conflicts?: {
			attributeId?: string;
			duplicates?: string[];
			overlapping?: number[];
		};
		// For operations affecting multiple items
		operation?: {
			type: "create" | "update" | "delete";
			count: number;
			affectedIds?: string[];
		};
		// For nested validation errors
		subErrors?: ValidationError[];
		// Generic additional data
		metadata?: Record<string, unknown>;
	};
}

export class ProductValidationError extends Error {
	public readonly code: string;
	public readonly httpStatus: HttpStatus;
	public readonly field?: string;
	public readonly details?: ValidationError["details"];

	constructor(data: ValidationError) {
		super(data.message);
		this.code = data.code;
		this.httpStatus = data.httpStatus ?? "Bad Request";
		this.field = data.field;
		this.details = data.details;
	}
}

export type ValidationResult<TData = void> =
	| { success: true; data: TData }
	| { success: false; error: ValidationError };

export function assertValid<T extends ValidationResult>(
	result: T,
): asserts result is Extract<T, { success: true }> {
	if (!result.success) throw new ProductValidationError(result.error);
}

export function assertValidWithData<T>(
	result: ValidationResult<T>,
): asserts result is { success: true; data: T } {
	if (!result.success) throw new ProductValidationError(result.error);
}

/*
Regex explanation:
^[a-zà-ÿ]        : string must start with a lowercase letter with latin char with accent (i.e éè)
[a-zà-ÿ ]*       : followed by zero or more lowercase letters with latin char with accent (i.e éè) or spaces
$                : end of string
*/
export const nameLowerPattern = t.String({
	pattern: "^[a-zà-ÿ][a-zà-ÿ ]*$",
	minLength: 3,
});

/*
Regex explanation:
^[a-zà-ÿ0-9]     : string must start with a lowercase letter with latin char with accent (i.e éè) or number
[a-zà-ÿ0-9 ]*    : followed by zero or more lowercase letters with latin char with accent (i.e éè), numbers or spaces
$                : end of string
*/
export const nameLowerPatternWithNumber = t.String({
	pattern: "^[a-zà-ÿ0-9][a-zà-ÿ0-9 ]*$",
	minLength: 3,
});

export const uuid = t.String({ format: "uuid" });
export type uuid = typeof uuid.static;

export const uuidGuard = t.Object({ id: uuid });
export type uuidGuard = typeof uuidGuard.static;

export const uploadFileErrStatus = (
	fileError: UploadFileResult["error"] | { message: string },
) => {
	throw status(
		"Bad Gateway",
		fileError ?? "Unknown error while uploading file(s)",
	);
};
