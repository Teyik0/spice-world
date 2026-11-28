import type { Static } from "typebox";
import { Type } from "typebox";

import { standardSchema } from "../lib/schema";
import { FieldDescription, FieldError, FieldGroup } from "./field";
import {
  focusFirstError,
  SubmitButton,
  submitOnce,
  useActionResult,
  useAppForm,
} from "./form";

const forgotPasswordBody = Type.Object({
  email: Type.String({
    format: "email",
    error: "Enter a valid email address.",
  }),
});
const validator = standardSchema(forgotPasswordBody);

interface ForgotPasswordFormProps {
  /** Requests the reset email; resolves with the message to show, or nothing. */
  action: (
    values: Static<typeof forgotPasswordBody>,
  ) => Promise<string | undefined>;
}

export function ForgotPasswordForm({ action }: ForgotPasswordFormProps) {
  const [{ done, error }, onSubmit] = useActionResult(action);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: validator },
    onSubmit,
    onSubmitInvalid: focusFirstError,
  });

  // Same answer whether or not the account exists: nothing to enumerate.
  if (done) {
    return (
      <FieldDescription role="status">
        If an account exists for this email, a reset link is on its way. Check
        your inbox and spam folder.
      </FieldDescription>
    );
  }
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
        {error ? <FieldError>{error}</FieldError> : null}
        <SubmitButton>Send Reset Link</SubmitButton>
      </FieldGroup>
    </form>
  );
}
