import { Provider } from "jotai";
import { redirect } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { verifySession } from "@/lib/dal";
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
