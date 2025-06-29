import type { InitialValues } from "@modular-forms/qwik";
import {
	FormError,
	formAction$,
	useForm,
	valiForm$,
} from "@modular-forms/qwik";
import { component$, useTask$ } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";
import { LuLoader2 } from "@qwikest/icons/lucide";
import { toast } from "qwik-sonner";
import {
	email,
	forward,
	type InferInput,
	minLength,
	nonEmpty,
	object,
	partialCheck,
	pipe,
	string,
} from "valibot";
import { TextInput } from "@/components/text-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signUp } from "@/lib/auth-client";

export const useSignUpFormLoader = routeLoader$<InitialValues<SignUpForm>>(
	() => {
		return {
			firstName: "",
			lastName: "",
			email: "",
			password: "",
			confirmPassword: "",
		};
	},
);

const SignUpSchema = pipe(
	object({
		firstName: pipe(
			string(),
			nonEmpty("Please enter your first name."),
			minLength(2, "Your first name must have 2 at least characters."),
		),
		lastName: pipe(
			string(),
			nonEmpty("Please enter your last name."),
			minLength(2, "Your last name must have 2 at least characters."),
		),
		email: pipe(
			string(),
			nonEmpty("Please enter your email."),
			email("The email address is badly formatted."),
		),
		password: pipe(
			string(),
			nonEmpty("Please enter your password."),
			minLength(8, "Your password must have 8 characters or more."),
		),
		confirmPassword: string(),
	}),
	forward(
		partialCheck(
			[["password"], ["confirmPassword"]],
			(input) => input.password === input.confirmPassword,
			"The two passwords do not match.",
		),
		["confirmPassword"],
	),
);

export type SignUpForm = InferInput<typeof SignUpSchema>;

export const useFormAction = formAction$<SignUpForm>(
	async (values, { redirect }) => {
		const { data, error } = await signUp.email({
			email: values.email,
			password: values.password,
			name: `${values.firstName} ${values.lastName}`,
			callbackURL: "/",
		});
		if (data) {
			throw redirect(308, "/signin");
		}
		throw new FormError<SignUpForm>(error?.message || "Unknown error");
	},
	valiForm$(SignUpSchema),
);

export default component$(() => {
	const [signupForm, { Form, Field }] = useForm<SignUpForm>({
		loader: useSignUpFormLoader(),
		action: useFormAction(),
		validate: valiForm$(SignUpSchema),
	});

	useTask$(({ track }) => {
		const signup = track(signupForm);
		if (signup.response.status === "error") {
			toast.error(`Signup error: ${signup.response.message}`);
			signup.response.status = undefined;
		}
		if (signup.response.status === "success") {
			toast.success("Signup success");
			signup.response.status = undefined;
		}
	});

	return (
		<Card.Root class="z-50 max-w-md rounded-md rounded-tr-none">
			<Card.Header>
				<Card.Title class="text-lg md:text-xl">Sign Up</Card.Title>
				<Card.Description class="text-xs md:text-sm">
					Enter your information to create an account
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Form class="grid gap-4">
					<div class="grid grid-cols-2 gap-4">
						<Field name="firstName">
							{(field, props) => (
								<TextInput
									{...props}
									autoComplete="given-name"
									error={field.error}
									label="First name"
									placeholder="John"
									required
									type="text"
									value={field.value}
								/>
							)}
						</Field>

						<Field name="lastName">
							{(field, props) => (
								<TextInput
									{...props}
									autoComplete="family-name"
									error={field.error}
									label="Last name"
									placeholder="Doe"
									required
									type="text"
									value={field.value}
								/>
							)}
						</Field>
					</div>

					<Field name="email">
						{(field, props) => (
							<TextInput
								{...props}
								error={field.error}
								label="Email"
								placeholder="spice-world@example.com"
								required
								type="email"
								value={field.value}
							/>
						)}
					</Field>

					<Field name="password">
						{(field, props) => (
							<TextInput
								{...props}
								autoComplete="current-password"
								error={field.error}
								label="Password"
								placeholder="myStr0ngP@ssW0rd2!4"
								required
								type="password"
								value={field.value}
							/>
						)}
					</Field>

					<Field name="confirmPassword">
						{(field, props) => (
							<TextInput
								{...props}
								autoComplete="current-password"
								error={field.error}
								label="Confirm Password"
								placeholder="myStr0ngP@ssW0rd2!4"
								required
								type="password"
								value={field.value}
							/>
						)}
					</Field>

					<Button
						class="mt-2 w-full"
						disabled={signupForm.submitting}
						type="submit"
					>
						{signupForm.submitting ? (
							<LuLoader2 class="h-6 w-6 animate-spin" />
						) : (
							"Create an account"
						)}
					</Button>
				</Form>
			</Card.Content>
		</Card.Root>
	);
});
