import { app } from "@spice-world/web/lib/elysia";
import { type NextRequest, NextResponse } from "next/server";

export default async function middleware(req: NextRequest) {
	const cookieName = "better-auth.session_token";
	const sessionCookie = req.cookies.get(cookieName)?.value;
	const { error } = await app.api["is-admin"].get({
		headers: {
			cookie: sessionCookie ? `${cookieName}=${sessionCookie}` : "",
		},
	});

	if (error) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	const requestHeaders = new Headers(req.headers);
	requestHeaders.set("x-pathname", req.nextUrl.pathname);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: ["/dashboard/:path*"],
};
