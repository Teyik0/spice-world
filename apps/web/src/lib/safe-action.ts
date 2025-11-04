import {
	createSafeActionClient,
	DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { z } from "zod";

export const actionClient = createSafeActionClient({
	defineMetadataSchema() {
		return z.object({
			actionName: z.string(),
		});
	},
	handleServerError(e) {
		console.error("Action error:", e.message);

		if (e instanceof Error) {
			return e.message;
		}

		return DEFAULT_SERVER_ERROR_MESSAGE;
	},
	defaultValidationErrorsShape: "flattened",
});
