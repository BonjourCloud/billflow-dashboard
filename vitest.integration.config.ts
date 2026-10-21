import { defineConfig } from "vitest/config";
import path from "path";

// HTTP-level backend tests against a real (in-memory) MongoDB replica set.
// The first run downloads a MongoDB binary, so these are kept out of
// `npm test` and run with `npm run test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.test.ts"],
    setupFiles: ["./src/test/integration/setup.ts"],
    // Each file starts its own MongoDB; run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
