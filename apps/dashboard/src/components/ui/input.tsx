import { $, type PropsOf, component$ } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";

type InputProps = PropsOf<"input"> & {
  error?: string;
};

export const Input = component$<InputProps>(
  ({
    name,
    error,
    id,
    ["bind:value"]: valueSig,
    value,
    onInput$,
    ...props
  }) => {
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
          aria-invaid={!!error}
          // workaround to support two way data-binding on the Input component (https://github.com/QwikDev/qwik/issues/3926)
          value={valueSig ? valueSig.value : value}
          // onInput$={valueSig ? $((__, el) => (valueSig.value = el.value)) : onInput$}
          onInput$={valueSig ? handleInput$ : onInput$}
          class={cn(
            "rounded-lg border-input bg-background text-foreground file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex h-12 w-full border px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            props.class,
          )}
          id={inputId}
        />
        {error && (
          <div id={`${inputId}-error`} class="text-alert mt-1 text-sm">
            {error}
          </div>
        )}
      </>
    );
  },
);
