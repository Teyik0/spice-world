import type { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type { AnyFormApi } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Field, FieldError, FieldLabel } from "./field";
import { Input } from "./input";
import { Spinner } from "./spinner";

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

// shadcn's TanStack Form pattern (data-invalid on Field, aria-invalid on the
// control, FieldError under it), written once instead of in every form.
function TextField({
  label,
  labelEnd,
  ...props
}: ComponentProps<typeof Input> & { label: ReactNode; labelEnd?: ReactNode }) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  return (
    <Field data-invalid={isInvalid}>
      <div className="flex items-center">
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {labelEnd}
      </div>
      <Input
        aria-invalid={isInvalid}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        value={field.state.value}
        {...props}
      />
      {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
    </Field>
  );
}

function CheckboxField({
  label,
  ...props
}: CheckboxPrimitive.Root.Props & { label: ReactNode }) {
  const field = useFieldContext<boolean>();
  return (
    <Field orientation="horizontal">
      <Checkbox
        checked={field.state.value}
        id={field.name}
        name={field.name}
        onCheckedChange={(checked) => field.handleChange(checked)}
        {...props}
      />
      <FieldLabel className="font-normal" htmlFor={field.name}>
        {label}
      </FieldLabel>
    </Field>
  );
}

/** Pending state of the React form action: `<form action={() => form.handleSubmit()}>`. */
export function SubmitButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" {...props}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

/** `onSubmitInvalid` handler: moves focus to the first invalid field. */
export function focusFirstError({ formApi }: { formApi: AnyFormApi }) {
  const invalid = Object.entries(formApi.state.fieldMeta).find(
    ([, meta]) => meta && !meta.isValid,
  );
  if (invalid) {
    document.querySelector<HTMLElement>(`[id="${invalid[0]}"]`)?.focus();
  }
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, CheckboxField },
  formComponents: {},
});
