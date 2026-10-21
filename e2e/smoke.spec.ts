import { test, expect, type Page } from "@playwright/test";
import { E2E_API_URL } from "../playwright.config";

const siteSettings = {
  id: "default",
  brand_name: "E2E Brand",
  logo_url: null,
  logo_display_url: null,
  hero_headline: "Bills, handled end to end",
  hero_subheadline: "Smoke-test copy served by the mocked API.",
  hero_cta_label: "Try it now",
  theme_primary_hsl: "221 83% 53%",
  theme_accent_hsl: "262 83% 58%",
  theme_background_hsl: "0 0% 100%",
  theme_font_pair: "inter",
  updated_at: "2026-10-01T00:00:00.000Z",
};

const pricingTiers = [
  {
    id: "tier-free",
    slug: "free",
    name: "Starter",
    price_monthly: 0,
    price_yearly: 0,
    billing_period: "forever",
    cta_label: "Start free",
    is_highlighted: false,
    is_visible: true,
    sort_order: 0,
    features: ["Unlimited bills"],
    updated_at: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "tier-pro",
    slug: "pro",
    name: "Pro",
    price_monthly: 9,
    price_yearly: 90,
    billing_period: "month",
    cta_label: "Go Pro",
    is_highlighted: true,
    is_visible: true,
    sort_order: 1,
    features: ["Installment tracking"],
    updated_at: "2026-10-01T00:00:00.000Z",
  },
];

async function mockApi(page: Page) {
  const unexpected: string[] = [];
  await page.route(`${E2E_API_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });

    if (url.pathname === "/api/site-settings") return json(siteSettings);
    if (url.pathname === "/api/pricing-tiers") return json(pricingTiers);

    // Signed-out pages should not call authenticated endpoints.
    unexpected.push(`${route.request().method()} ${url.pathname}`);
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: "Authentication required." }),
    });
  });
  return unexpected;
}

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("landing page renders branding and pricing from the API", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  const unexpected = await mockApi(page);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Bills, handled end to end" }),
  ).toBeVisible();
  await expect(page.getByText("E2E Brand").first()).toBeVisible();

  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Starter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Pro" })).toBeVisible();

  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("signed-out visitors are redirected from the dashboard to login", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const unexpected = await mockApi(page);

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("signed-out visitors cannot open the admin panel", async ({ page }) => {
  await mockApi(page);

  await page.goto("/admin/users");

  await expect(page).toHaveURL(/\/login$/);
});

test("page metadata and favicon are BillFlow-branded", async ({ page, request }) => {
  // Crawlers and link previews read the static HTML.
  const html = await (await request.get("/")).text();
  expect(html).toContain("<title>BillFlow</title>");
  expect(html).toContain('<meta property="og:title" content="BillFlow" />');
  expect(html.toLowerCase()).not.toContain("lovable");

  // At runtime the title follows the brand name from site settings.
  await mockApi(page);
  await page.goto("/");
  await expect(page).toHaveTitle(siteSettings.brand_name);

  for (const icon of ["/favicon.svg", "/favicon.ico"]) {
    const response = await request.get(icon);
    expect(response.status(), icon).toBe(200);
    expect(response.headers()["content-type"], icon).toMatch(/^image\//);
  }
});

test("unknown routes show the 404 page", async ({ page }) => {
  await mockApi(page);

  await page.goto("/definitely-not-a-page");

  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});
