import { vercel } from "@teyik0/furin/adapters/vercel";
import { defineConfig } from "@teyik0/furin/config";
import tailwind from "bun-plugin-tailwind";

export default defineConfig({
  serverEntry: "src/server.ts",
  targets: ["bun", vercel({ regions: ["fra1"] })],
  plugins: [{ ...tailwind, buildOnly: true }],
});
