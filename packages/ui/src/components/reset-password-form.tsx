import type { Static } from "typebox";
import { Type } from "typebox";

import { standardSchema } from "../lib/schema";
import { FieldDescription, FieldError, FieldGroup } from "./field";
import {
  focusFirstError,
  SubmitButton,
  useActionResult,
  useAppForm,
} from "./form";

// Better Auth's minPasswordLength (8) is the rule; the API enforces it too.
const resetPasswordBody = Type.Object({
  newPassword: Type.String({
    minLength: 8,
    error: "Use at least 8 characters.",
  }),
  confirmPassword: Type.String(),
});
const validator = standardSchema(resetPasswordBody);

interface ResetPasswordFormProps {
  /** Sets the new password; resolves with the message to show, or nothing. */
  action: (
    values: Static<typeof resetPasswordBody>,
  ) => Promise<string | undefined>;
}

export function ResetPasswordForm({ action }: ResetPasswordFormProps) {
  const [{ done, error }, onSubmit] = useActionResult(action);
  const form = useAppForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: validator },
    onSubmit,
    onSubmitInvalid: focusFirstError,
  });

  if (done) {
    return (
      <FieldDescription role="status">
        Your password has been reset. You can now sign in with it.
      </FieldDescription>
    );
  }
  return (
    <form action={() => form.handleSubmit()} noValidate>
      <FieldGroup>
        <form.AppField name="newPassword">
          {(field) => (
            <field.TextField
              autoComplete="new-password"
              label="New Password"
              type="password"
            />
          )}
        </form.AppField>
        <form.AppField
          name="confirmPassword"
          validators={{
            onSubmit: ({ value, fieldApi }) =>
              value === fieldApi.form.getFieldValue("newPassword")
                ? undefined
                : { message: "Passwords must match." },
          }}
        >
          {(field) => (
            <field.TextField
              autoComplete="new-password"
              label="Confirm Password"
              type="password"
            />
          )}
        </form.AppField>
        {error ? <FieldError>{error}</FieldError> : null}
        <SubmitButton>Reset Password</SubmitButton>
      </FieldGroup>
    </form>
  );
}
