import {
  component$,
  useSignal,
  useTask$,
  type HTMLAttributes,
  type QRL,
} from "@qwik.dev/core";
import clsx from "clsx";
import { Label } from "./label";

type SelectProps = {
  ref: QRL<(element: HTMLSelectElement) => void>;
  name: string;
  value: string | string[] | null | undefined;
  onInput$: (event: Event, element: HTMLSelectElement) => void;
  onChange$: (event: Event, element: HTMLSelectElement) => void;
  onBlur$: (event: Event, element: HTMLSelectElement) => void;
  options: { label: string; value: string }[];
  multiple?: boolean;
  size?: number;
  placeholder?: string;
  class?: string;
  label?: string;
  error?: string;
};

/**
 * Select field that allows users to select predefined values. Various
 * decorations can be displayed in or around the field to communicate the
 * entry requirements.
 */
export const Select = component$(
  ({ value, options, label, error, ...props }: SelectProps) => {
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

    return (
      <div class={clsx("flex flex-col gap-1", props.class)}>
        {label && <Label class="font-semibold">{label}</Label>}
        <div class="relative flex items-center">
          <select
            {...props}
            class={clsx(
              "w-full appearance-none rounded-lg border-2 bg-transparent px-3 outline-none",
              error
                ? "border-red-600/50 dark:border-red-400/50"
                : "border-slate-200 hover:border-slate-300 focus:border-sky-600/50 dark:border-slate-800 dark:hover:border-slate-700 dark:focus:border-sky-400/50",
              multiple ? "py-5" : "h-9",
              placeholder && !values.value?.length && "text-slate-500",
            )}
            id={name}
            aria-invalid={!!error}
            aria-errormessage={`${name}-error`}
          >
            {placeholder && (
              <option value="" disabled hidden selected={!value}>
                {placeholder}
              </option>
            )}
            {options.map(({ label, value }) => (
              <option
                key={value}
                value={value}
                selected={values.value?.includes(value)}
                class="font-semibold"
              >
                {label}
              </option>
            ))}
          </select>
          {!multiple && (
            <AngleDownIcon class="pointer-events-none absolute right-3 h-6" />
          )}
        </div>
      </div>
    );
  },
);

const AngleDownIcon = component$((props: HTMLAttributes<SVGSVGElement>) => (
  <svg
    viewBox="0 0 36 48"
    role="img"
    aria-label="Angle down icon"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width={4}
    {...props}
  >
    <path d="m4.1 17 13.92 13.96L31.78 17" />
  </svg>
));
