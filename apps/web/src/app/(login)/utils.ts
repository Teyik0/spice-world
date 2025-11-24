import { t } from "elysia";

export const passwordValidation = t.String({
	minLength: 8,
	pattern: '^(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*(),.?":{}|<>]).*$',
	error:
		"Password must be at least 8 characters and contain uppercase, lowercase, and special characters",
});
