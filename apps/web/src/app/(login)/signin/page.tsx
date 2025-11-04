import { cookies } from "next/headers";
import { Suspense } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { SignInFormSkeleton } from "../skeletons";
import { EmailSignIn } from "./email-signin";
import { GoogleSignIn } from "./google-signin";

export default async function page() {
	const cookieStore = await cookies();
	const rememberMe = cookieStore.get("rememberMe")?.value === "true";
	const lastEmail = cookieStore.get("lastEmail")?.value ?? "";

	return (
		<Suspense fallback={<SignInFormSkeleton />}>
			<Card className="rounded-tl-none shadow-xl">
				<CardHeader className="space-y-2 pb-4">
					<CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
					<CardDescription className="text-sm">
						Sign in to your account to continue
					</CardDescription>
				</CardHeader>
				<CardContent>
					<EmailSignIn rememberMe={rememberMe} lastEmail={lastEmail} />
					<GoogleSignIn />
				</CardContent>
			</Card>
		</Suspense>
	);
}
