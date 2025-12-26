import { ThemeProvider } from "@spice-world/web/components/theme-provider";
import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { verifySession } from "@spice-world/web/lib/dal";
import { Provider } from "jotai";
import { redirect } from "next/navigation";
import { AppSidebar } from "./sidebar-left";

export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	const login = await verifySession();
	if (!login) redirect("/");

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<main className="flex-1 flex">
				<Provider>
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
		</ThemeProvider>
	);
}
