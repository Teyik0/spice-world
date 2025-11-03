"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

const forgotPasswordSchema = z.object({
	email: z.email("Please enter a valid email address"),
});

export default function ForgotPasswordPage() {
	const [emailSent, setEmailSent] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
		},
		validators: {
			onSubmit: forgotPasswordSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await authClient.forgetPassword(
					{
						email: value.email,
						redirectTo: `${window.location.origin}/reset-password`,
					},
					{
						onSuccess: () => {
							setEmailSent(true);
							toast.success("Email sent", {
								description:
									"Check your inbox for password reset instructions.",
							});
						},
						onError: (ctx) => {
							toast.error("Failed to send email", {
								description:
									ctx.error.message ||
									"An error occurred. Please try again later.",
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
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							<form.Field
								name="email"
								children={(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel htmlFor={field.name}>Email</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												type="email"
												placeholder="max@example.com"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												autoComplete="email"
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
											"Send reset link"
										)}
									</Button>
								)}
							</form.Subscribe>

							<Button variant="ghost" className="w-full" asChild>
								<Link href="/signin">Back to sign in</Link>
							</Button>
						</FieldGroup>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
