import { authClient } from "@spice-world/web/lib/utils";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export default async function middleware(req: NextRequest) {
  // Forward every cookie: over HTTPS the session cookie is __Secure- prefixed.
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: { cookie: req.headers.get("cookie") ?? "" } },
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
