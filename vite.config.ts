import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

import { codecovVitePlugin } from "@codecov/vite-plugin";

export default defineConfig({
  optimizeDeps: {
    include: ["@vitest/coverage-v8/browser"],
  },
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
  plugins: [
    dts(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "@eatsjobs/media-mock",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
});
