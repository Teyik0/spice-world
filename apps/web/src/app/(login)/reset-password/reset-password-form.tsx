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
import { resetPasswordAction } from "./actions";

interface ResetPasswordFormProps {
	token?: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
	const { execute, result, isExecuting } = useAction(resetPasswordAction);
	const passwordReset = result.data?.passwordReset;

	if (!token) {
		return (
			<Card className="rounded-tl-none shadow-xl">
				<CardHeader className="space-y-2 pb-4">
					<CardTitle className="text-2xl font-bold">
						Invalid reset link
					</CardTitle>
					<CardDescription className="text-sm">
						This password reset link is invalid or has expired
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="rounded-lg bg-red-50 p-4 dark:bg-red-950">
							<p className="text-sm text-red-800 dark:text-red-200">
								Invalid reset link. Please request a new one.
							</p>
						</div>
						<Button variant="outline" className="w-full" asChild>
							<Link href="/forgot-password">Request new reset link</Link>
						</Button>
						<Button variant="ghost" className="w-full" asChild>
							<Link href="/signin">Back to sign in</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Reset password</CardTitle>
				<CardDescription className="text-sm">
					{passwordReset
						? "We've successfully reset your password"
						: "Enter your new password below"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{passwordReset ? (
					<div className="space-y-4">
						<div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
							<p className="text-sm text-green-800 dark:text-green-200">
								Your password has been successfully reset. You can now sign in
								using your new password.
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
								newPassword: formData.get("newPassword") as string,
								confirmPassword: formData.get("confirmPassword") as string,
								token,
							});
						}}
						className="grid gap-4"
					>
						<div className="space-y-2">
							<Label htmlFor="newPassword">New password</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								placeholder="Enter new password"
								required
								autoComplete="new-password"
								disabled={isExecuting}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirmPassword">Confirm password</Label>
							<Input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								placeholder="Confirm new password"
								required
								autoComplete="new-password"
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
								{(() => {
									// Gather all possible error messages
									const errors = [
										...(result.validationErrors.formErrors || []),
										...Object.values(
											result.validationErrors.fieldErrors || {},
										).flat(),
									];

									// Render them with * and line breaks
									return errors.map((err, idx) => (
										<span key={idx}>
											* {err}
											<br />
										</span>
									));
								})()}
							</div>
						)}

						<Button type="submit" className="w-full" disabled={isExecuting}>
							{isExecuting ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								"Reset password"
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
