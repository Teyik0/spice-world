import { $, component$, type PropsOf } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";

type InputProps = PropsOf<"input"> & {
	error?: string;
};

export const Input = component$<InputProps>(
	({ name, error, id, "bind:value": valueSig, value, onInput$, ...props }) => {
		const inputId = id || name;

		const handleInput$ = $((event: Event) => {
			const target = event.target as HTMLInputElement;
			if (valueSig) {
				valueSig.value = target.value;
			}
		});

		return (
			<>
				<input
					{...props}
					aria-errormessage={`${inputId}-error`}
					aria-invalid={!!error}
					// workaround to support two way data-binding on the Input component (https://github.com/QwikDev/qwik/issues/3926)
					class={cn(
						"flex h-12 w-full rounded-lg border border-input bg-background px-3 py-1 text-foreground text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
						props.class,
					)}
					id={inputId}
					onInput$={valueSig ? handleInput$ : onInput$}
					value={valueSig ? valueSig.value : value}
				/>
				{error && (
					<div class="mt-1 text-alert text-sm" id={`${inputId}-error`}>
						{error}
					</div>
				)}
			</>
		);
	},
);
