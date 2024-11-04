import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "./lib/main.ts",
      name: "MediaMock",
      fileName: "media-mock",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["**.test.ts", "**.test.tsx", "**.spec.ts", "**.spec.tsx"],
    },
  },
  test: {
    globals: true,
    browser: {
      provider: "playwright",
      enabled: true,
      name: "chromium",
      headless: true,
    },
  },
  plugins: [dts()],
});
