import { TextInput } from "@/components/text-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signUp } from "@/lib/auth-client";
import { component$, useTask$ } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";
import type { InitialValues } from "@modular-forms/qwik";
import {
  FormError,
  formAction$,
  useForm,
  valiForm$,
} from "@modular-forms/qwik";
import { LuLoader2 } from "@qwikest/icons/lucide";
import { toast } from "qwik-sonner";
import * as v from "valibot";

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

const SignUpSchema = v.pipe(
  v.object({
    firstName: v.pipe(
      v.string(),
      v.nonEmpty("Please enter your first name."),
      v.minLength(2, "Your first name must have 2 at least characters."),
    ),
    lastName: v.pipe(
      v.string(),
      v.nonEmpty("Please enter your last name."),
      v.minLength(2, "Your last name must have 2 at least characters."),
    ),
    email: v.pipe(
      v.string(),
      v.nonEmpty("Please enter your email."),
      v.email("The email address is badly formatted."),
    ),
    password: v.pipe(
      v.string(),
      v.nonEmpty("Please enter your password."),
      v.minLength(8, "Your password must have 8 characters or more."),
    ),
    confirmPassword: v.string(),
  }),
  v.forward(
    v.partialCheck(
      [["password"], ["confirmPassword"]],
      (input) => input.password === input.confirmPassword,
      "The two passwords do not match.",
    ),
    ["confirmPassword"],
  ),
);

export type SignUpForm = v.InferInput<typeof SignUpSchema>;

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
    <Card.Root class="z-50 rounded-md rounded-tr-none max-w-md">
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
                  type="text"
                  label="First name"
                  placeholder="John"
                  autoComplete="given-name"
                  value={field.value}
                  error={field.error}
                  required
                />
              )}
            </Field>

            <Field name="lastName">
              {(field, props) => (
                <TextInput
                  {...props}
                  type="text"
                  label="Last name"
                  placeholder="Doe"
                  autoComplete="family-name"
                  value={field.value}
                  error={field.error}
                  required
                />
              )}
            </Field>
          </div>

          <Field name="email">
            {(field, props) => (
              <TextInput
                {...props}
                type="email"
                label="Email"
                placeholder="spice-world@example.com"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

          <Field name="password">
            {(field, props) => (
              <TextInput
                {...props}
                type="password"
                label="Password"
                autoComplete="current-password"
                placeholder="myStr0ngP@ssW0rd2!4"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

          <Field name="confirmPassword">
            {(field, props) => (
              <TextInput
                {...props}
                type="password"
                label="Confirm Password"
                autoComplete="current-password"
                placeholder="myStr0ngP@ssW0rd2!4"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

          <Button
            type="submit"
            class="w-full mt-2"
            disabled={signupForm.submitting}
          >
            {signupForm.submitting ? (
              <LuLoader2 class="animate-spin h-6 w-6" />
            ) : (
              "Create an account"
            )}
          </Button>
        </Form>
      </Card.Content>
    </Card.Root>
  );
});
