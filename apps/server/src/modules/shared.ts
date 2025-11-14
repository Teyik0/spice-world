import { status, t } from "elysia";
import type { uploadFile } from "@/lib/images";

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

export const uuid = t.String({ format: "uuid" });
export type uuid = typeof uuid.static;

export const uuidGuard = t.Object({ id: uuid });
export type uuidGuard = typeof uuidGuard.static;

export const uploadFileErrStatus = (
	fileError: Awaited<ReturnType<typeof uploadFile>>["error"],
) => {
	return status(
		"Bad Gateway",
		fileError ?? "Unknown error while uploading file",
	);
};
