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
import { MultiSelect } from "@spice-world/web/components/ui/multi-select";
import { Select } from "@spice-world/web/components/ui/select";
import { Switch } from "@spice-world/web/components/ui/switch";
import { Textarea } from "@spice-world/web/components/ui/textarea";
import { typeboxToStandardSchema } from "@spice-world/web/lib/utils";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { TSchema } from "elysia";
import { Loader2 } from "lucide-react";
import type * as React from "react";

export const { fieldContext, useFieldContext, formContext, useFormContext } =
	createFormHookContexts();

export function SubmitButton(props: React.ComponentProps<typeof Button>) {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => [state.isSubmitting]}>
			{([isSubmitting]) => (
				<Button type="submit" {...props} disabled={isSubmitting}>
					{isSubmitting ? (
						<>
							<Loader2 size={16} className="animate-spin" /> {props.children}
						</>
					) : (
						props.children
					)}
				</Button>
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
			value={field.state.value ?? ""}
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
			value={field.state.value ?? ""}
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
			value={field.state.value ?? ""}
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

function FormMultiSelect({
	onValueChange: _,
	defaultValue: __,
	value: ___,
	onBlur: ____,
	...props
}: React.ComponentProps<typeof MultiSelect>) {
	const field = useFieldContext<string[]>();
	return (
		<MultiSelect
			{...props}
			value={field.state.value || []}
			onValueChange={(value) => field.handleChange(value)}
			onBlur={() => field.handleBlur()}
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
		MultiSelect: FormMultiSelect,
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

export function useForm<TSchemaType extends TSchema>({
	schema,
	defaultValues,
	onSubmit,
	validationMode = "onBlur",
}: {
	schema: TSchemaType;
	defaultValues: TSchemaType["static"];
	onSubmit: (values: TSchemaType["static"]) => void | Promise<void>;
	validationMode?: "onChange" | "onBlur" | "onSubmit";
}) {
	// Convert TypeBox schema to Standard Schema V1
	const standardSchema = typeboxToStandardSchema(schema);

	return useAppForm({
		defaultValues,
		validators: {
			[validationMode]: standardSchema,
		},
		onSubmit: async ({ value }) => {
			await onSubmit(value as TSchemaType["static"]);
		},
	});
}

/**
 * Form wrapper component that provides form context and handles submission
 *
 * @example
 * const form = useForm({
 *   schema: t.Object({ email: t.String({ format: 'email' }) }),
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
export function Form({
	children,
	form: formProp,
	...props
}: {
	children: React.ReactNode;
	// biome-ignore lint/suspicious/noExplicitAny: Form component accepts forms with any schema type
	form: any;
} & Omit<React.ComponentProps<"form">, "onSubmit">) {
	// Cast to the expected form type to work around TypeScript's variance issues
	const form = formProp as ReturnType<typeof useAppForm>;

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

	const hasSubmitError = field.state.meta.errorMap.onSubmit;
	const hasTouchedError =
		field.state.meta.isTouched && !field.state.meta.isValid;
	const shouldShowError = hasSubmitError || hasTouchedError;

	if (!shouldShowError) {
		return null;
	}

	// Convert string errors to the format FieldError expects: Array<{ message?: string }>
	const errorsToShow = hasSubmitError
		? typeof hasSubmitError === "string"
			? [{ message: hasSubmitError }]
			: hasSubmitError
		: field.state.meta.errors.map((err) =>
				typeof err === "string" ? { message: err } : err,
			);
	console.log("errorToShow", errorsToShow);

	return <FieldError {...props} errors={errorsToShow} />;
}
