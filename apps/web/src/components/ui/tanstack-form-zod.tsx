"use client";

import { Button } from "@spice-world/web/components/ui/button";
import { Checkbox } from "@spice-world/web/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription as FieldDescriptionComponent,
	FieldError,
	FieldLabel as FieldLabelComponent,
} from "@spice-world/web/components/ui/field";
import { Input } from "@spice-world/web/components/ui/input";
import { Select } from "@spice-world/web/components/ui/select";
import { Switch } from "@spice-world/web/components/ui/switch";
import { Textarea } from "@spice-world/web/components/ui/textarea";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type * as React from "react";
import type { z } from "zod";

export const { fieldContext, useFieldContext, formContext, useFormContext } =
	createFormHookContexts();

export function SubmitButton(props: React.ComponentProps<typeof Button>) {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button type="submit" disabled={isSubmitting} {...props} />
			)}
		</form.Subscribe>
	);
}

function FormInput(props: React.ComponentProps<typeof Input>) {
	const field = useFieldContext<string>();

	return (
		<Input
			id={field.name}
			name={field.name}
			value={field.state.value}
			placeholder={props.placeholder}
			onBlur={field.handleBlur}
			onChange={(e) => field.handleChange(e.target.value)}
			{...props}
		/>
	);
}

function FormSelect(props: React.ComponentProps<typeof Select>) {
	const field = useFieldContext<string>();
	return (
		<Select
			name={field.name}
			value={field.state.value}
			onValueChange={(value) => field.handleChange(value)}
			{...props}
		/>
	);
}

function FormTextarea(props: React.ComponentProps<typeof Textarea>) {
	const field = useFieldContext<string>();
	return (
		<Textarea
			id={field.name}
			name={field.name}
			value={field.state.value}
			placeholder={props.placeholder}
			onBlur={field.handleBlur}
			onChange={(e) => field.handleChange(e.target.value)}
			{...props}
		/>
	);
}

function FormCheckbox(props: React.ComponentProps<typeof Checkbox>) {
	const field = useFieldContext<boolean>();
	return (
		<Checkbox
			id={field.name}
			name={field.name}
			checked={Boolean(field.state.value)}
			onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
			{...props}
		/>
	);
}

function FormSwitch(props: React.ComponentProps<typeof Switch>) {
	const field = useFieldContext<boolean>();
	return (
		<Switch
			id={field.name}
			name={field.name}
			checked={Boolean(field.state.value)}
			onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
			{...props}
		/>
	);
}

function FieldField(props: React.ComponentProps<typeof Field>) {
	const field = useFieldContext<string>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
	return <Field {...props} data-invalid={isInvalid} />;
}

export const { useAppForm } = createFormHook({
	fieldComponents: {
		Input: FormInput,
		Select: FormSelect,
		Textarea: FormTextarea,
		Checkbox: FormCheckbox,
		Switch: FormSwitch,
		Label: FieldLabel,
		Description: FieldDescription,
		Message: FieldMessage,
		Field: FieldField,
		Content: FieldContent,
	},
	formComponents: {
		SubmitButton: SubmitButton,
	},
	fieldContext,
	formContext,
});

/**
 * Hook to create a TanStack form with Zod validation
 * Returns a type-safe FormApi with inferred form data type
 *
 * @example
 * const form = useForm({
 *   schema: z.object({ email: z.string().email() }),
 *   defaultValues: { email: '' },
 *   onSubmit: async (values) => console.log(values),
 * })
 * // form is typed as FormApi<{ email: string }>
 */

export function useForm<TSchema extends z.ZodType>({
	schema,
	defaultValues,
	onSubmit,
	validationMode = "onBlur",
}: {
	schema: TSchema;
	defaultValues: z.infer<TSchema>;
	onSubmit: (values: z.infer<TSchema>) => void | Promise<void>;
	validationMode?: "onChange" | "onBlur" | "onSubmit";
}) {
	return useAppForm({
		defaultValues,
		validators: {
			[validationMode]: schema,
		},
		onSubmit: async ({ value }) => {
			await onSubmit(value as z.infer<TSchema>);
		},
	});
}

/**
 * Form wrapper component that provides form context and handles submission
 *
 * @example
 * const form = useForm({
 *   schema: z.object({ email: z.string().email() }),
 *   defaultValues: { email: '' },
 *   onSubmit: async (values) => console.log(values),
 * })
 *
 * <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
 *   <form.AppField name="email">
 *     {(field) => (
 *       <Field>
 *         <FormLabel>Email</FormLabel>
 *         <FieldContent>
 *           <field.Input type="email" placeholder="you@example.com" />
 *           <FormMessage />
 *         </FieldContent>
 *       </Field>
 *     )}
 *   </form.AppField>
 *   <form.AppForm>
 *     <form.SubmitButton>Submit</form.SubmitButton>
 *   </form.AppForm>
 * </form>
 */
export function Form<TSchema extends z.ZodType>({
	children,
	form,
	...props
}: {
	children: React.ReactNode;
	form: ReturnType<typeof useForm<TSchema>>;
} & Omit<React.ComponentProps<"form">, "onSubmit">) {
	return (
		<form.AppForm>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
				{...props}
			>
				{children}
			</form>
		</form.AppForm>
	);
}

function FieldLabel(props: React.ComponentProps<typeof FieldLabelComponent>) {
	const field = useFieldContext<string>();

	return <FieldLabelComponent htmlFor={field.name} {...props} />;
}

/**
 * Description text for form field - uses FieldDescription with TanStack Form integration
 */
function FieldDescription({
	className,
	...props
}: React.ComponentProps<typeof FieldDescriptionComponent>) {
	const field = useFieldContext<string>();

	return (
		<FieldDescriptionComponent
			id={`${field.name}-form-item-description`}
			className={className}
			{...props}
		/>
	);
}

function FieldMessage(props: React.ComponentProps<typeof FieldError>) {
	const field = useFieldContext<string>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<>
			{isInvalid ? (
				<FieldError {...props} errors={field.state.meta.errors} />
			) : null}
		</>
	);
}
