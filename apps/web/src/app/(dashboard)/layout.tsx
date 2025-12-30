import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { Toaster } from "@spice-world/web/components/ui/sonner";
import { verifySession } from "@spice-world/web/lib/dal";
import { Provider } from "jotai";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppSidebar } from "../sidebar-left";

export default async function DashboardLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const login = await verifySession();
	if (!login) redirect("/signin");

	return (
		<main className="flex-1 flex">
			<NuqsAdapter>
				<Provider>
					<Toaster />
					<AppSidebar login={login} />
					<SidebarProvider
						style={
							{
								"--sidebar-width": "350px",
							} as React.CSSProperties
						}
					>
						{children}
					</SidebarProvider>
				</Provider>
			</NuqsAdapter>
		</main>
	);
}
