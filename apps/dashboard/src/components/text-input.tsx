import { component$, type QRL } from "@qwik.dev/core";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AutoCompleteValue =
	| "off"
	| "on"
	| "name"
	| "honorific-prefix"
	| "given-name"
	| "additional-name"
	| "family-name"
	| "honorific-suffix"
	| "nickname"
	| "email"
	| "username"
	| "new-password"
	| "current-password"
	| "one-time-code"
	| "organization-title"
	| "organization"
	| "street-address"
	| "address-line1"
	| "address-line2"
	| "address-line3"
	| "address-level4"
	| "address-level3"
	| "address-level2"
	| "address-level1"
	| "country"
	| "country-name"
	| "postal-code"
	| "cc-name"
	| "cc-given-name"
	| "cc-additional-name"
	| "cc-family-name"
	| "cc-number"
	| "cc-exp"
	| "cc-exp-month"
	| "cc-exp-year"
	| "cc-csc"
	| "cc-type"
	| "transaction-currency"
	| "transaction-amount"
	| "language"
	| "bday"
	| "bday-day"
	| "bday-month"
	| "bday-year"
	| "sex"
	| "tel"
	| "tel-country-code"
	| "tel-national"
	| "tel-area-code"
	| "tel-local"
	| "tel-extension"
	| "impp"
	| "url"
	| "photo";

interface TextInputProps {
	name: string;
	type: "text" | "email" | "tel" | "password" | "url" | "date";
	autoComplete?:
		| AutoCompleteValue
		| Omit<AutoCompleteValue, string>
		| undefined;
	label?: string;
	placeholder?: string;
	value: string | undefined;
	error: string;
	required?: boolean;
	ref: QRL<(element: HTMLInputElement) => void>;
	onInput$: (event: Event, element: HTMLInputElement) => void;
	onChange$: (event: Event, element: HTMLInputElement) => void;
	onBlur$: (event: Event, element: HTMLInputElement) => void;
}

export const TextInput = component$(
	({ label, error, ...props }: TextInputProps) => {
		const { name, required } = props;
		return (
			<div class="grid gap-2">
				{label && (
					<Label for={name}>
						{label} {required && <span class="text-red-700">*</span>}
					</Label>
				)}
				<Input
					{...props}
					aria-errormessage={`${name}-error`}
					aria-invalid={!!error}
					id={name}
					autoComplete={props.autoComplete}
				/>
				{error && (
					<div class="text-red-700 text-xs" id={`${name}-error`}>
						{error}
					</div>
				)}
			</div>
		);
	},
);
