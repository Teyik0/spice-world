import { authClient } from "@spice-world/web/lib/utils";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export default async function middleware(req: NextRequest) {
  const cookieName = "better-auth.session_token";
  const sessionCookie = req.cookies.get(cookieName)?.value;

  const { data: session } = await authClient.getSession({
    fetchOptions: {
      headers: {
        cookie: sessionCookie ? `${cookieName}=${sessionCookie}` : "",
      },
    },
  });

  if (session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/signin", req.url));
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
  // Applique le middleware UNIQUEMENT aux routes protégées (dashboard)
  // Exclut: /signin, /signup, /forgot-password, /reset-password, /api, /_next, /favicon.ico, etc.
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - signin (route publique)
     * - signup (route publique)
     * - forgot-password (route publique)
     * - reset-password (route publique)
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!signin|signup|forgot-password|reset-password|api|_next/static|_next/image|favicon.ico).*)",
  ],
};
