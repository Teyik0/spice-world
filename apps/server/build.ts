import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = ".vercel/output";
await mkdir(outDir, { recursive: true });

const funcDir = join(outDir, "functions", "index.func");
await mkdir(funcDir, { recursive: true });

await Bun.build({
	entrypoints: ["src/index.ts"],
	// compile: {
	// 	outfile: `${outDir}/index.js`,
	// },
	outdir: funcDir,
	minify: {
		syntax: true,
		whitespace: true,
	},
	target: "bun",
	format: "esm",
});

// Make Bun treat index.js as ESM inside the function mount
await writeFile(
	join(funcDir, "package.json"),
	JSON.stringify({ type: "module" }, null, 2),
);

// Function runtime config
await writeFile(
	join(funcDir, ".vc-config.json"),
	JSON.stringify(
		{
			runtime: "nodejs24.x",
			handler: "index.js",
			shouldAddHelpers: true,
		},
		null,
		2,
	),
);

// Routes: static first, then all to the function
await writeFile(
	join(outDir, "config.json"),
	JSON.stringify(
		{
			version: 3,
			routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index" }],
		},
		null,
		2,
	),
);
