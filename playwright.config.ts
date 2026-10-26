import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// Never resolved: every request to it is answered by page.route() mocks in
// the specs, so the smoke tests need no backend or database.
export const E2E_API_URL = "https://api.e2e.test";

export default defineConfig({
  testDir: "./e2e",
  // Full-stack journeys run with playwright.fullstack.config.ts.
  testIgnore: "fullstack/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Smoke-test the production build. VITE_CLERK_PUBLISHABLE_KEY comes from the
  // environment or the project-root .env (a Clerk development key works).
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_API_URL: E2E_API_URL },
  },
});
