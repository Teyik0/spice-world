"use client";

import { Button } from "@spice-world/web/components/ui/button";
import { Checkbox } from "@spice-world/web/components/ui/checkbox";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { signInAction } from "./actions";

interface EmailSignInProps {
	rememberMe: boolean;
	lastEmail: string;
}

export const EmailSignIn = ({
	rememberMe = true,
	lastEmail = "",
}: EmailSignInProps) => {
	const { execute, result, isExecuting } = useAction(signInAction);

	return (
		<form
			className="grid gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				const formData = new FormData(e.currentTarget);
				execute({
					email: formData.get("email") as string,
					password: formData.get("password") as string,
					rememberMe: formData.get("rememberMe") === "on",
				});
			}}
		>
			<div className="space-y-2">
				<Label htmlFor="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					placeholder="max@example.com"
					defaultValue={lastEmail}
					required
					autoComplete="email"
					disabled={isExecuting}
				/>
			</div>

			<div className="space-y-2">
				<div className="flex items-center">
					<Label htmlFor="password">Password</Label>
					<Link
						href="/forgot-password"
						className="ml-auto inline-block text-sm underline"
					>
						Forgot your password?
					</Link>
				</div>
				<Input
					id="password"
					name="password"
					type="password"
					placeholder="password"
					required
					autoComplete="current-password"
					disabled={isExecuting}
				/>
			</div>

			<div className="flex items-center gap-2">
				<Checkbox
					id="rememberMe"
					name="rememberMe"
					defaultChecked={rememberMe}
					disabled={isExecuting}
				/>
				<Label htmlFor="rememberMe">Remember me</Label>
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
				{isExecuting ? <Loader2 size={16} className="animate-spin" /> : "Login"}
			</Button>
		</form>
	);
};
