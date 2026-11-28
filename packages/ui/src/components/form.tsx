import type { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type { AnyFormApi } from "@tanstack/react-form";
import {
  createFormHook,
  createFormHookContexts,
  revalidateLogic,
} from "@tanstack/react-form";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  MENU_ITEM,
  MENU_LABEL,
} from "./dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";
import { Spinner } from "./spinner";
import { Textarea } from "./textarea";

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

const isInvalid = ({
  meta,
}: {
  meta: { isTouched: boolean; isValid: boolean };
}) => meta.isTouched && !meta.isValid;

// shadcn's TanStack Form pattern (data-invalid on Field, aria-invalid on the
// control, FieldError under it), written once instead of in every form.
function LabeledField({
  children,
  description,
  htmlFor,
  label,
  labelEnd,
}: {
  children: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
  labelEnd?: ReactNode;
}) {
  const { name, state } = useFieldContext<unknown>();
  return (
    <Field data-invalid={isInvalid(state)}>
      <div className="flex items-center">
        <FieldLabel htmlFor={htmlFor ?? name}>{label}</FieldLabel>
        {labelEnd}
      </div>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {isInvalid(state) ? <FieldError errors={state.meta.errors} /> : null}
    </Field>
  );
}

type Labels = Omit<ComponentProps<typeof LabeledField>, "children" | "htmlFor">;

/**
 * The props every text control takes from its field. The id is generated: two
 * forms on a page (a dialog over an editor) may both have a `name` field.
 */
function useTextControl() {
  const field = useFieldContext<string>();
  return {
    "aria-invalid": isInvalid(field.state),
    id: useId(),
    name: field.name,
    onBlur: field.handleBlur,
    onChange: (e: { target: { value: string } }) =>
      field.handleChange(e.target.value),
    value: field.state.value,
  };
}

function TextField({
  description,
  label,
  labelEnd,
  ...props
}: ComponentProps<typeof Input> & Labels) {
  const control = useTextControl();
  return (
    <LabeledField
      description={description}
      htmlFor={control.id}
      label={label}
      labelEnd={labelEnd}
    >
      <Input {...control} {...props} />
    </LabeledField>
  );
}

function TextareaField({
  description,
  label,
  ...props
}: ComponentProps<typeof Textarea> & Labels) {
  const control = useTextControl();
  return (
    <LabeledField description={description} htmlFor={control.id} label={label}>
      <Textarea {...control} {...props} />
    </LabeledField>
  );
}

/** A single choice, in the dashboard menu look (trigger-wide, titled with the label). */
function SelectField({
  description,
  items,
  label,
  labelEnd,
}: Labels & { items: { label: string; value: string }[] }) {
  const field = useFieldContext<string>();
  return (
    <LabeledField description={description} label={label} labelEnd={labelEnd}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-invalid={isInvalid(field.state)}
              className="w-full justify-between font-normal"
              id={field.name}
              onBlur={field.handleBlur}
              variant="outline"
            />
          }
        >
          {items.find(({ value }) => value === field.state.value)?.label}
          <ChevronDownIcon className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80">
          <DropdownMenuGroup>
            <DropdownMenuLabel className={MENU_LABEL}>
              {label}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value: string) => field.handleChange(value)}
              value={field.state.value}
            >
              {items.map(({ label: text, value }) => (
                <DropdownMenuRadioItem
                  className={MENU_ITEM}
                  key={value}
                  value={value}
                >
                  {text}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </LabeledField>
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

/**
 * Adapts an app action (resolves an error message, or nothing on success) to
 * TanStack's `onSubmit`, keeping its outcome for the form to render.
 */
export function useActionResult<Values>(
  action: (values: Values) => Promise<string | undefined>,
) {
  const [result, setResult] = useState({ done: false, error: "" });
  const onSubmit = async ({ value }: { value: Values }) => {
    const error = await action(value);
    setResult({ done: !error, error: error ?? "" });
  };
  return [result, onSubmit] as const;
}

/**
 * `onSubmitInvalid` handler: moves focus to the first invalid field, by its
 * `name` (or `id`), in the form being submitted.
 */
export function focusFirstError({ formApi }: { formApi: AnyFormApi }) {
  const invalid = Object.entries(formApi.state.fieldMeta).find(
    ([, meta]) => meta && !meta.isValid,
  );
  if (invalid) {
    const form = document.activeElement?.closest("form") ?? document;
    form
      .querySelector<HTMLElement>(
        `[name="${invalid[0]}"], [id="${invalid[0]}"]`,
      )
      ?.focus();
  }
}

export const validateOnSubmitThenChange = revalidateLogic();

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { CheckboxField, SelectField, TextareaField, TextField },
  formComponents: {},
});
