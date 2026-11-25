"use client";

import { cn } from "@spice-world/web/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isSignIn = pathname === "/signin";
  const isSignUp = pathname === "/signup";

  return (
    <main className="from-background via-muted/20 to-background flex min-h-screen items-center justify-center bg-linear-to-br p-4">
      <article className="w-full max-w-md">
        <nav
          aria-label="Authentication navigation"
          className="bg-card flex w-1/2 overflow-hidden rounded-t-lg border border-b-0"
        >
          <Link
            className={cn(
              "flex-1 px-6 py-3 text-center font-medium transition-all",
              "hover:bg-muted/50",
              isSignIn
                ? "bg-background text-foreground border-primary border-b-2"
                : "text-muted-foreground",
            )}
            href="/signin"
          >
            Sign In
          </Link>
          <Link
            className={cn(
              "flex-1 px-6 py-3 text-center font-medium transition-all",
              "hover:bg-muted/50",
              isSignUp
                ? "bg-background text-foreground border-primary border-b-2"
                : "text-muted-foreground",
            )}
            href="/signup"
          >
            Sign Up
          </Link>
        </nav>

        <section className="w-full">{children}</section>
      </article>
    </main>
  );
}
