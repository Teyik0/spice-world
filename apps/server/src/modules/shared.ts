import type { UnwrapSchema } from "elysia";
import { problem, t } from "elysia";

import type { UploadError } from "../lib/images";

type HttpStatus =
  | "Bad Request"
  | "Not Found"
  | "Conflict"
  | "Unprocessable Content"
  | "Unauthorized"
  | "Forbidden"
  | "Internal Server Error";

export interface ValidationError {
  code: string;
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
  field?: string;
  httpStatus?: HttpStatus;
  message: string;
}

export class ProductValidationError extends Error {
  readonly code: string;
  readonly httpStatus: HttpStatus;
  readonly field?: string;
  readonly details?: ValidationError["details"];

  constructor(data: ValidationError) {
    super(data.message);
    this.code = data.code;
    this.httpStatus = data.httpStatus ?? "Bad Request";
    this.field = data.field;
    this.details = data.details;
  }
}

export type ValidationResult<TData = void> =
  { success: true; data: TData } | { success: false; error: ValidationError };

export function assertValid<T extends ValidationResult>(
  result: T,
): asserts result is Extract<T, { success: true }> {
  if (!result.success) {
    throw new ProductValidationError(result.error);
  }
}

export function assertValidWithData<T>(
  result: ValidationResult<T>,
): asserts result is { success: true; data: T } {
  if (!result.success) {
    throw new ProductValidationError(result.error);
  }
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
export type uuid = UnwrapSchema<typeof uuid>;

export const uuidGuard = t.Object({ id: uuid });
export type uuidGuard = UnwrapSchema<typeof uuidGuard>;

/** The `version` the client last read, to reject stale writes. */
export const versionHeaders = t.Object({
  "x-version": t.Integer({ minimum: 1, maximum: 2_147_483_647 }),
});
export interface ExpectedVersion {
  expectedVersion: number;
}

export const imageKey = t.String({ minLength: 1 });
export const imageUrl = t.String({
  format: "url",
  pattern: "^https://",
});

export const invalidImage = t.Object({
  code: t.Literal("INVALID_IMAGE"),
  message: t.String(),
});
export const uploadFailed = t.Object({
  code: t.Literal("UPLOAD_FAILED"),
  message: t.String(),
});

export const uploadFileErrStatus = (error: UploadError | null) =>
  error === "INVALID_IMAGE"
    ? problem("Unprocessable Content", {
        code: "INVALID_IMAGE",
        message: "Image cannot be decoded",
      })
    : problem("Bad Gateway", {
        code: "UPLOAD_FAILED",
        message: "Image upload failed",
      });

export const imageResult = t.Object(
  {
    id: uuid,
    altText: t.Nullable(t.String()),
    isThumbnail: t.Boolean(),
    keyThumb: imageKey,
    keyMedium: imageKey,
    keyLarge: imageKey,
    urlThumb: imageUrl,
    urlMedium: imageUrl,
    urlLarge: imageUrl,
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type ImageResult = UnwrapSchema<typeof imageResult>;
