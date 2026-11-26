import { defineConfig } from "@teyik0/furin/config";
import tailwind from "bun-plugin-tailwind";

export default defineConfig({
  serverEntry: "src/server.ts",
  targets: ["bun"],
  plugins: [{ ...tailwind, buildOnly: true }],
});
