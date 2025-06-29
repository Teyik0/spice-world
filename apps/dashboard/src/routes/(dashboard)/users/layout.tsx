import { routeAction$ } from "@qwik.dev/router";
import { authClient, getBetterAuthCookie } from "@/lib/auth-client";

export const useDeleteUser = routeAction$(
	async ({ userId }, { cookie, fail }) => {
		const { data, error } = await authClient.admin.removeUser(
			{ userId: String(userId) },
			{ headers: { cookie: getBetterAuthCookie(cookie) } },
		);
		if (data) return { success: data.success };
		return fail(error.status, {
			message: error.message || "Failed to delete user",
		});
	},
);

export const useEditUserRole = routeAction$(async (user, { cookie, fail }) => {
	const { data, error } = await authClient.admin.setRole(
		{
			userId: String(user.userId),
			role: String(user.role) as "user" | "admin",
		},
		{ headers: { cookie: getBetterAuthCookie(cookie) } },
	);
	if (data) return { success: true };
	return fail(error.status, {
		message: error.message || "Failed to update user role",
	});
});
