import { component$ } from "@qwik.dev/core";
import { useDocumentHead, useLocation } from "@qwik.dev/router";

/**
 * The RouterHead component is placed inside of the document `<head>` element.
 */
export const RouterHead = component$(() => {
	const head = useDocumentHead();
	const loc = useLocation();

	return (
		<>
			<title>{head.title}</title>

			<link href={loc.url.href} rel="canonical" />
			<meta content="width=device-width, initial-scale=1.0" name="viewport" />
			<link href="/favicon.svg" rel="icon" type="image/svg+xml" />

			{head.meta.map((m) => (
				<meta key={m.key} {...m} />
			))}

			{head.links.map((l) => (
				<link key={l.key} {...l} />
			))}

			{head.styles.map((s) => (
				<style
					key={s.key}
					{...s.props}
					{...(s.props?.dangerouslySetInnerHTML
						? {}
						: { dangerouslySetInnerHTML: s.style })}
				/>
			))}

			{head.scripts.map((s) => (
				<script
					key={s.key}
					{...s.props}
					{...(s.props?.dangerouslySetInnerHTML
						? {}
						: { dangerouslySetInnerHTML: s.script })}
				/>
			))}
		</>
	);
});
