import {
  type QRL,
  component$,
  type HTMLInputAutocompleteAttribute,
} from "@qwik.dev/core";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type TextInputProps = {
  name: string;
  type: "text" | "email" | "tel" | "password" | "url" | "date";
  autoComplete?:
    | HTMLInputAutocompleteAttribute
    | Omit<HTMLInputAutocompleteAttribute, string>
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
};

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
          id={name}
          aria-invalid={!!error}
          aria-errormessage={`${name}-error`}
        />
        {error && (
          <div id={`${name}-error`} class="text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  },
);
