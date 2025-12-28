import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { Toaster } from "@spice-world/web/components/ui/sonner";
import { verifySession } from "@spice-world/web/lib/dal";
import { Provider } from "jotai";
import { redirect } from "next/navigation";
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
		</main>
	);
}
