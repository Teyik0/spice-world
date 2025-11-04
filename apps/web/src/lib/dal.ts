import { revalidateTag, unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { authClient } from "./utils";

export const verifySession = cache(async () => {
	return await getCachedSession();
});

const getCachedSession = unstable_cache(
	async () => {
		const { data } = await authClient.getSession({
			fetchOptions: {
				headers: await headers(),
			},
		});
		if (!data) return null;
		return data;
	},
	["auth-session"],
	{
		tags: ["auth", "session"],
		revalidate: 3600, // 1 hour
	},
);

export async function invalidateSessionCache() {
	"use server";
	revalidateTag("session", "default");
}
