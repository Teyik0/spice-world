import type { UnwrapSchema } from "elysia";
import { problem, t } from "elysia";

import type { UploadError } from "../lib/images";

/*
[a-zà-öø-ÿœ]+        : lowercase latin letters with accents (÷ is excluded)
(?: [a-zà-öø-ÿœ]+)*  : words separated by single spaces, without trailing space
maxLength            : keeps values under the Postgres btree index row limit
*/
export const nameLowerPattern = t.String({
  pattern: "^[a-zà-öø-ÿœ]+(?: [a-zà-öø-ÿœ]+)*$",
  minLength: 3,
  maxLength: 100,
  error: "Use 3 to 100 lowercase letters, with single spaces between words.",
});

/** Same as nameLowerPattern, digits allowed. */
export const nameLowerPatternWithNumber = t.String({
  pattern: "^[a-zà-öø-ÿœ0-9]+(?: [a-zà-öø-ÿœ0-9]+)*$",
  minLength: 3,
  maxLength: 100,
  error:
    "Use 3 to 100 lowercase letters or digits, with single spaces between words.",
});

/** Bounds for array inputs: keeps bulk inserts under the Postgres parameter limit. */
export const MAX_ATTRIBUTES = 50;
export const MAX_ATTRIBUTE_VALUES = 100;

export const uuid = t.String({ format: "uuid" });

export const onceEach = ({
  update = [],
  delete: deleted = [],
}: {
  update?: { id: string }[];
  delete?: string[];
}) => {
  const ids = [...update.map(({ id }) => id), ...deleted];
  return new Set(ids).size === ids.length;
};
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
    ? problem("Bad Request", {
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
    position: t.Integer({ minimum: 0 }),
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
