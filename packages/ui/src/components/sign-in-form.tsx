import type { ReactNode } from "react";
import type { Static } from "typebox";
import { Type } from "typebox";

import { standardSchema } from "../lib/schema";
import { FieldError, FieldGroup } from "./field";
import {
  focusFirstError,
  SubmitButton,
  submitOnce,
  useActionResult,
  useAppForm,
} from "./form";

const signInBody = Type.Object({
  email: Type.String({
    format: "email",
    error: "Enter a valid email address.",
  }),
  password: Type.String({ minLength: 1, error: "Enter your password." }),
  rememberMe: Type.Boolean(),
});
const validator = standardSchema(signInBody);

interface SignInFormProps {
  action: (values: Static<typeof signInBody>) => Promise<string | undefined>;
  defaultEmail?: string;
  forgotPassword?: ReactNode;
}

export function SignInForm({
  action,
  defaultEmail = "",
  forgotPassword,
}: SignInFormProps) {
  const [{ error }, onSubmit] = useActionResult(action);
  const form = useAppForm({
    defaultValues: { email: defaultEmail, password: "", rememberMe: true },
    validators: { onSubmit: validator },
    onSubmit,
    onSubmitInvalid: focusFirstError,
  });

  return (
    <form action={submitOnce(form)} noValidate>
      <FieldGroup>
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              autoComplete="email"
              label="Email"
              placeholder="you@example.com"
              spellCheck={false}
              type="email"
            />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              autoComplete="current-password"
              label="Password"
              labelEnd={forgotPassword}
              type="password"
            />
          )}
        </form.AppField>
        <form.AppField name="rememberMe">
          {(field) => <field.CheckboxField label="Remember me" />}
        </form.AppField>
        {error ? <FieldError>{error}</FieldError> : null}
        <SubmitButton>Sign In</SubmitButton>
      </FieldGroup>
    </form>
  );
}
