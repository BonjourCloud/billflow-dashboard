import { defineConfig, devices } from "@playwright/test";

// Full-stack browser journeys: the production frontend build (with a Clerk
// stand-in) against the real Express API on an in-memory MongoDB.
// See e2e/fullstack/ and docs/TESTING.md.
const API_PORT = 5175;
const WEB_PORT = 4175;
export const E2E_API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e/fullstack",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "server/node_modules/.bin/tsx e2e/fullstack/api-server.ts",
      url: `${E2E_API}/api/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { E2E_API_PORT: String(API_PORT), E2E_FRONTEND_ORIGIN: WEB },
    },
    {
      command: `npx vite build -c vite.e2e.config.ts --mode e2e && npx vite preview -c vite.e2e.config.ts --mode e2e --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_API_URL: E2E_API, VITE_CLERK_PUBLISHABLE_KEY: "pk_test_e2e_stand_in" },
    },
  ],
});
