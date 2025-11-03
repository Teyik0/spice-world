"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/utils";
import { passwordValidation } from "../utils";

const resetPasswordSchema = z
	.object({
		newPassword: passwordValidation,
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "Passwords must match",
		path: ["confirmPassword"],
	});

interface ResetPasswordFormProps {
	token?: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
	const router = useRouter();

	const form = useForm({
		defaultValues: {
			newPassword: "",
			confirmPassword: "",
		},
		validators: {
			onSubmit: resetPasswordSchema,
		},
		onSubmit: async ({ value }) => {
			if (!token) {
				toast.error("Invalid token", {
					description: "Please request a new password reset link.",
				});
				return;
			}

			try {
				await authClient.resetPassword(
					{
						newPassword: value.newPassword,
						token,
					},
					{
						onSuccess: () => {
							toast.success("Password reset successful", {
								description: "You can now sign in with your new password.",
							});
							router.push("/signin");
						},
						onError: (ctx) => {
							toast.error("Failed to reset password", {
								description:
									ctx.error.message ||
									"The reset link may be invalid or expired. Please try again.",
							});
						},
					},
				);
			} catch (_error: unknown) {
				toast.error("An unexpected error occurred", {
					description: "Please try again later.",
				});
			}
		},
	});

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
					Enter your new password below
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<form.Field
							name="newPassword"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>New password</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											placeholder="Enter new password"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>

						<form.Field
							name="confirmPassword"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>
											Confirm password
										</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											placeholder="Confirm new password"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>

						<form.Subscribe
							selector={(state) => [state.canSubmit, state.isSubmitting]}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									type="submit"
									className="w-full"
									disabled={!canSubmit || isSubmitting}
								>
									{isSubmitting ? (
										<Loader2 size={16} className="animate-spin" />
									) : (
										"Reset password"
									)}
								</Button>
							)}
						</form.Subscribe>

						<Button variant="ghost" className="w-full" asChild>
							<Link href="/signin">Back to sign in</Link>
						</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
