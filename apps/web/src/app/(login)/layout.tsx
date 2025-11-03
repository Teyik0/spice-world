"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Layout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const pathname = usePathname();
	const isSignIn = pathname === "/signin";
	const isSignUp = pathname === "/signup";

	return (
		<main className="flex min-h-screen items-center justify-center p-4 bg-linear-to-br from-background via-muted/20 to-background">
			<article className="w-full max-w-md">
				<nav
					aria-label="Authentication navigation"
					className="flex rounded-t-lg overflow-hidden border border-b-0 bg-card w-1/2"
				>
					<Link
						href="/signin"
						className={cn(
							"flex-1 px-6 py-3 text-center font-medium transition-all",
							"hover:bg-muted/50",
							isSignIn
								? "bg-background text-foreground border-b-2 border-primary"
								: "text-muted-foreground",
						)}
					>
						Sign In
					</Link>
					<Link
						href="/signup"
						className={cn(
							"flex-1 px-6 py-3 text-center font-medium transition-all",
							"hover:bg-muted/50",
							isSignUp
								? "bg-background text-foreground border-b-2 border-primary"
								: "text-muted-foreground",
						)}
					>
						Sign Up
					</Link>
				</nav>

				<section className="w-full">{children}</section>
			</article>
		</main>
	);
}
