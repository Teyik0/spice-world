import { cookies } from "next/headers";
import { SignIn } from "./signin";

export default async function page() {
	const cookieStore = await cookies();
	const rememberMe = cookieStore.get("rememberMe")?.value === "true";
	const lastEmail = cookieStore.get("lastEmail")?.value ?? "";

	return <SignIn rememberMe={rememberMe} lastEmail={lastEmail} />;
}
