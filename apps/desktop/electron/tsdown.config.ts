import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts", "src/preload.ts"],
  format: ["cjs"],
  outDir: "dist-electron",
  sourcemap: true,
  clean: true,
  noExternal: (id) => id.startsWith("@agents/"),
  inlineOnly: false,
});
