import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

await Bun.build({
	entrypoints: ["src/index.ts"],
	outdir: "dist",
	compile: {
		outfile: "server",
	},
	minify: {
		whitespace: true,
		syntax: true,
	},
	target: "bun",
});

const pattern = new Bun.Glob("**/*.node");
const napiImageRealPath = dirname(
	realpathSync(resolve(import.meta.dir, "node_modules/@napi-rs/image")),
);

const files = Array.from(
	pattern.scanSync({
		cwd: napiImageRealPath,
		followSymlinks: true,
		absolute: true,
	}),
);

const fileName = basename(files[0]);
const destPath = `dist/${fileName}`;

const file = Bun.file(files[0]);
if (!(await file.exists()))
	throw new Error("@napi-rs/image .node napi file binding not found");

await Bun.write(destPath, file);
