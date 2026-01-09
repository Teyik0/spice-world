import { Toaster } from "@spice-world/web/components/ui/sonner";
import { verifySession } from "@spice-world/web/lib/dal";
import { Provider } from "jotai";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppSidebar } from "../sidebar-left";
import { getSidebarExpanded } from "./cookies";
import { SidebarRightProvider } from "./sidebar-provider";

export default async function DashboardLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const login = await verifySession();
	if (!login) redirect("/signin");

	const sidebarExpanded = await getSidebarExpanded();

	return (
		<main className="flex-1 flex">
			<NuqsAdapter>
				<Provider>
					<Toaster />
					<AppSidebar login={login} />
					<SidebarRightProvider initialExpanded={sidebarExpanded}>
						{children}
					</SidebarRightProvider>
				</Provider>
			</NuqsAdapter>
		</main>
	);
}
