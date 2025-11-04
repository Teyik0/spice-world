"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "./actions";

export default function ForgotPasswordPage() {
	const { execute, result, isExecuting } = useAction(forgotPasswordAction);

	const emailSent = result.data?.emailSent;

	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
				<CardDescription className="text-sm">
					{emailSent
						? "We've sent you an email with instructions to reset your password"
						: "Enter your email address and we'll send you a link to reset your password"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{emailSent ? (
					<div className="space-y-4">
						<div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
							<p className="text-sm text-green-800 dark:text-green-200">
								If an account exists with this email, you'll receive a password
								reset link shortly. Please check your inbox and spam folder.
							</p>
						</div>
						<Button variant="outline" className="w-full" asChild>
							<Link href="/signin">Back to sign in</Link>
						</Button>
					</div>
				) : (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							const formData = new FormData(e.currentTarget);
							execute({
								email: formData.get("email") as string,
							});
						}}
						className="grid gap-4"
					>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="max@example.com"
								required
								autoComplete="email"
								disabled={isExecuting}
							/>
						</div>

						{result.serverError && (
							<div
								role="alert"
								aria-live="polite"
								className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
							>
								{result.serverError}
							</div>
						)}
						{result.validationErrors && (
							<div
								role="alert"
								aria-live="polite"
								className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
							>
								{result.validationErrors.formErrors?.[0] ||
									Object.values(result.validationErrors.fieldErrors || {})
										.flat()
										.join(", ")}
							</div>
						)}

						<Button type="submit" className="w-full" disabled={isExecuting}>
							{isExecuting ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								"Send reset link"
							)}
						</Button>

						<Button variant="ghost" className="w-full" asChild>
							<Link href="/signin">Back to sign in</Link>
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
