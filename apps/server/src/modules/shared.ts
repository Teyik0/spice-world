import { status } from "elysia";
import type { UploadFileResult } from "uploadthing/types";
import * as v from "valibot";

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
export const nameLowerPattern = v.pipe(
	v.string(),
	v.minLength(3),
	v.regex(/^[a-zà-ÿ][a-zà-ÿ ]*$/),
);
export type nameLowerPattern = v.InferOutput<typeof nameLowerPattern>;

/*
Regex explanation:
^[a-zà-ÿ0-9]     : string must start with a lowercase letter with latin char with accent (i.e éè) or number
[a-zà-ÿ0-9 ]*    : followed by zero or more lowercase letters with latin char with accent (i.e éè), numbers or spaces
$                : end of string
*/
export const nameLowerPatternWithNumber = v.pipe(
	v.string(),
	v.minLength(3),
	v.regex(/^[a-zà-ÿ0-9][a-zà-ÿ0-9 ]*$/),
);
export type nameLowerPatternWithNumber = v.InferOutput<
	typeof nameLowerPatternWithNumber
>;

export const uuid = v.pipe(v.string(), v.uuid());
export type uuid = v.InferOutput<typeof uuid>;

export const uuidGuard = v.object({ id: uuid });
export type uuidGuard = v.InferOutput<typeof uuidGuard>;

export const uploadFileErrStatus = (
	fileError: UploadFileResult["error"] | { message: string },
) => {
	throw status(
		"Bad Gateway",
		fileError ?? "Unknown error while uploading file(s)",
	);
};
