import { component$ } from "@qwik.dev/core";

export const ThemeSwitch = component$(() => {
	return (
		<div class="flex items-center gap-3">
			<label class="switch">
				<input
					id="hide-checkbox"
					onClick$={() => {
						const theme = document.documentElement.className;
						if (theme === "light") {
							document.documentElement.className = "dark";
							localStorage.setItem("theme", "dark");
						} else {
							document.documentElement.className = "light";
							localStorage.setItem("theme", "light");
						}
					}}
					type="checkbox"
				/>
				<span class="slider round" />
			</label>
		</div>
	);
});
