import { $, component$, type PropsOf } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";

export const Checkbox = component$<PropsOf<"input">>(
	({ id, name, "bind:checked": checkedSig, checked, onInput$, ...props }) => {
		const inputId = id || name;

		// const handleInput$ = $((event: InputEvent) => {
		//   const target = event.checked as HTMLInputElement
		//   if (checkedSig) {
		//     checkedSig.value = target.value
		//   }
		// })

		return (
			<input
				type="checkbox"
				{...props}
				// workaround to support two way data-binding on the Input component (https://github.com/QwikDev/qwik/issues/3926)
				checked={checkedSig ? checkedSig.value : checked}
				class={cn(
					"peer h-4 w-4 shrink-0 cursor-pointer border-primary text-primary accent-primary ring-offset-background focus:ring-ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
					props.class,
				)}
				data-checked={checked || checkedSig?.value || ""}
				id={inputId}
				onInput$={
					checkedSig ? $((_, el) => (checkedSig.value = el.checked)) : onInput$
				}
			/>
		);
	},
);
