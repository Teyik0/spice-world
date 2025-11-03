import { z } from "zod";

export const passwordValidation = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
	.regex(/[a-z]/, "Password must contain at least one lowercase letter")
	.regex(
		/[!@#$%^&*(),.?":{}|<>]/,
		"Password must contain at least one special character",
	);
