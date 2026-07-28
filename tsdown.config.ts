import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./lib/main.ts",
  // umd is published via unpkg/jsDelivr and needs the MediaMock global.
  format: ["es", "cjs", "umd"],
  globalName: "MediaMock",
  platform: "browser",
  // Emits a self-contained main.d.ts plus main.d.cts, so CJS and ESM consumers
  // each resolve declarations that match their module format.
  dts: true,
  minify: true,
  clean: true,
  outDir: "dist",
  // Validate the published package shape on every build.
  attw: true,
  publint: true,
});
