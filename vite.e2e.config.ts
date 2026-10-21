import path from "path";
import { defineConfig, mergeConfig, type ConfigEnv } from "vite";
import baseConfig from "./vite.config";

// TEST-ONLY build for the full-stack browser journeys (playwright.fullstack.config.ts).
// Identical to the app build except that @clerk/react is replaced by a local
// stand-in and the output goes to dist-e2e/. Run with `--mode e2e`; never deploy it.
export default defineConfig((env: ConfigEnv) =>
  mergeConfig(baseConfig(env), {
    resolve: {
      alias: {
        "@clerk/react": path.resolve(__dirname, "e2e/fullstack/fake-clerk-react.tsx"),
      },
    },
    build: { outDir: "dist-e2e" },
  }),
);
