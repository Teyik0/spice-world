import { revalidateTag, unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { authClient } from "./utils";

export const verifySession = cache(async () => {
	const h = await headers();
	return await getCachedSession(h);
});

const getCachedSession = unstable_cache(
	async (headersParam: Headers) => {
		const { data } = await authClient.getSession({
			fetchOptions: {
				headers: headersParam,
			},
		});

		return data;
	},
	["auth-session"],
	{
		tags: ["auth", "session"],
		revalidate: 3600,
	},
);

export async function invalidateSessionCache() {
	"use server";
	revalidateTag("session", "default");
}
