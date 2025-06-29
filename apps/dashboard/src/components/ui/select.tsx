import {
	component$,
	type QRL,
	type QwikJSX,
	useSignal,
	useTask$,
} from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";
import { Label } from "./label";

type SelectProps = {
	ref?: QRL<(element: HTMLSelectElement) => void>;
	name: string;
	value: string | string[] | null | undefined;
	onInput$?: (event: Event, element: HTMLSelectElement) => void;
	onChange$?: (event: Event, element: HTMLSelectElement) => void;
	onBlur$?: (event: Event, element: HTMLSelectElement) => void;
	options: { label: string; value: string }[];
	multiple?: boolean;
	size?: number;
	placeholder?: string;
	class?: string;
	label?: string;
	error?: string;
	required?: boolean;
	disabled?: boolean;
};

/**
 * Select field that allows users to select predefined values. Various
 * decorations can be displayed in or around the field to communicate the
 * entry requirements.
 */
export const Select = component$(
	({
		value,
		options,
		label,
		error,
		required,
		disabled,
		...props
	}: SelectProps) => {
		const { name, multiple, placeholder } = props;

		// Create computed value of selected values
		const values = useSignal<string[]>();
		useTask$(({ track }) => {
			track(() => value);
			values.value = Array.isArray(value)
				? value
				: value && typeof value === "string"
					? [value]
					: [];
		});

		const inputId = name || `select-${Math.random().toString(36).substr(2, 9)}`;

		return (
			<div class="grid gap-2">
				{label && (
					<Label for={inputId}>
						{label} {required && <span class="text-red-700">*</span>}
					</Label>
				)}
				<div class="relative">
					<select
						{...props}
						aria-errormessage={error ? `${inputId}-error` : undefined}
						aria-invalid={!!error}
						class={cn(
							"flex h-12 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
							error && "border-destructive focus-visible:ring-destructive",
							multiple && "h-auto min-h-[3rem] py-2",
							"appearance-none pr-8",
							props.class,
						)}
						disabled={disabled}
						id={inputId}
					>
						{placeholder && (
							<option disabled hidden selected={!value} value="">
								{placeholder}
							</option>
						)}
						{options.map(({ label, value: optionValue }) => (
							<option
								key={optionValue}
								selected={values.value?.includes(optionValue)}
								value={optionValue}
							>
								{label}
							</option>
						))}
					</select>
					{!multiple && (
						<AngleDownIcon class="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 h-4 w-4 text-muted-foreground" />
					)}
				</div>
				{error && (
					<div class="text-destructive text-xs" id={`${inputId}-error`}>
						{error}
					</div>
				)}
			</div>
		);
	},
);

const AngleDownIcon = component$((props: QwikJSX.IntrinsicElements["svg"]) => (
	<svg
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="2"
		viewBox="0 0 24 24"
		{...props}
	>
		<title>Angle Down</title>
		<path d="m6 9 6 6 6-6" />
	</svg>
));
