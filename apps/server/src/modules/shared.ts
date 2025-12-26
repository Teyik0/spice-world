import { status, t } from "elysia";
import type { UploadFileResult } from "uploadthing/types";
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
