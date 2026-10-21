import { test, expect, type Page, type APIRequestContext, type TestInfo } from "@playwright/test";
import { E2E_API } from "../../playwright.fullstack.config";

// Major user journeys against the real API and MongoDB (see api-server.ts).
// Every test signs in as its own user, so tests and viewports never share data.

const ADMIN = "user_e2e_admin";
const DAY = 24 * 60 * 60 * 1000;
const dateInput = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * DAY).toISOString().slice(0, 10);

function uniqueUser(testInfo: TestInfo, label: string): string {
  const suffix = `${testInfo.project.name}_${testInfo.workerIndex}_${Date.now().toString(36)}`;
  return `user_e2e_${label}_${suffix}`.replace(/[^A-Za-z0-9_]/g, "_");
}

async function signInAs(page: Page, userId: string) {
  await page.addInitScript((id) => {
    localStorage.setItem("billflow-e2e-user", id);
    localStorage.setItem("billflow-e2e-next-user", id);
  }, userId);
}

function api(request: APIRequestContext, userId: string) {
  const headers = { Authorization: `Bearer e2e:${userId}` };
  return {
    post: async (path: string, data: unknown) => {
      const res = await request.post(`${E2E_API}${path}`, { headers, data });
      expect(res.status(), `${path}: ${await res.text()}`).toBeLessThan(300);
      return res.json();
    },
  };
}

async function expectNoHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, `${where} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

// Money is shown in rupees everywhere; no visible text may contain "$".
async function expectNoDollarSign(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  expect(text, `${where} shows a "$"`).not.toContain("$");
}

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("signs in from the landing page and signs out", async ({ page }, testInfo) => {
  const errors = trackPageErrors(page);
  const user = uniqueUser(testInfo, "auth");
  await page.addInitScript((id) => localStorage.setItem("billflow-e2e-next-user", id), user);

  await page.goto("/");
  await expectNoHorizontalOverflow(page, "landing");
  await expectNoDollarSign(page, "landing");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Continue with Google" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Monthly Flow")).toBeVisible();
  await expectNoHorizontalOverflow(page, "dashboard");
  await expectNoDollarSign(page, "dashboard");

  await page.getByTitle("Sign out").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("creates a bill and records a payment", async ({ page }, testInfo) => {
  const errors = trackPageErrors(page);
  await signInAs(page, uniqueUser(testInfo, "bills"));
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Add Bill" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill Name").fill("Broadband");
  await dialog.getByLabel("Amount (₹)").fill("1499");
  await dialog.getByLabel("Due Date").fill(dateInput(10));
  await dialog.getByRole("button", { name: "Add Bill" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByText("Broadband").first();
  await expect(row).toBeVisible();
  await expect(page.getByText("₹1,499.00").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "dashboard with a bill");
  await expectNoDollarSign(page, "dashboard with a bill");

  await row.click();
  await expect(page).toHaveURL(/\/bill\/[0-9a-f]{24}$/);
  await expectNoHorizontalOverflow(page, "bill detail");
  await expectNoDollarSign(page, "bill detail");

  await page.getByRole("button", { name: "Record Payment" }).first().click();
  const payment = page.getByRole("dialog");
  await payment.getByLabel("Amount (₹)").fill("1499");
  await payment.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "UPI" }).click();
  await payment.getByRole("button", { name: "Record Payment" }).click();
  await expect(payment).toBeHidden();

  await expect(page.getByText("Payment History")).toBeVisible();
  await expect(page.getByText("UPI").first()).toBeVisible();
  await expect(page.getByText("₹1,499.00").first()).toBeVisible();
  await expect(page.getByText("paid", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("adds and cancels a recurring subscription", async ({ page }, testInfo) => {
  const errors = trackPageErrors(page);
  await signInAs(page, uniqueUser(testInfo, "subs"));
  await page.goto("/subscriptions");

  await page.getByRole("button", { name: "Add Subscription" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subscription Name").fill("Music Premium");
  await dialog.getByLabel("Monthly Cost (₹)").fill("119");
  await dialog.getByLabel("First Billing Date").fill(dateInput(7));
  await dialog.getByRole("button", { name: "Add Subscription" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("Music Premium").first()).toBeVisible();
  await expect(page.getByText("₹119.00").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "subscriptions");
  await expectNoDollarSign(page, "subscriptions");

  await page.getByTitle("Cancel subscription").first().click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Are you sure you want to cancel Music Premium?")).toBeVisible();
  await confirm.getByRole("button", { name: "Stop Renewals" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(/inactive|cancelled/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("creates an installment plan and views its schedule", async ({ page }, testInfo) => {
  const errors = trackPageErrors(page);
  await signInAs(page, uniqueUser(testInfo, "emi"));
  await page.goto("/installments");

  await page.getByRole("button", { name: /Create (Your First )?Plan/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Plan Name *").fill("Phone EMI");
  await dialog.getByLabel("Principal Amount (₹) *").fill("60000");
  await dialog.getByLabel("Installment Count (Months) *").fill("6");
  await dialog.getByLabel("First Due Date *").fill(dateInput(5));
  await expect(dialog.getByText("₹10,000.00").first()).toBeVisible(); // live preview per month
  await dialog.getByRole("button", { name: /create plan/i }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("Phone EMI").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "installments");
  await expectNoDollarSign(page, "installments");

  await page.getByRole("heading", { name: "Phone EMI", level: 3 }).click();
  await expect(page).toHaveURL(/\/installments\/[0-9a-f]{24}$/);
  await expect(page.getByText("₹60,000.00").first()).toBeVisible();
  await expect(page.getByText("6 scheduled installment bills.", { exact: false })).toBeVisible();
  for (let n = 1; n <= 6; n++) {
    await expect(page.getByText(`Installment ${n} of 6`)).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "View / Pay" })).toHaveCount(6);
  await expectNoHorizontalOverflow(page, "installment detail");
  await expectNoDollarSign(page, "installment detail");
  expect(errors).toEqual([]);
});

test("shows reminders and marks them read", async ({ page, request }, testInfo) => {
  const errors = trackPageErrors(page);
  const user = uniqueUser(testInfo, "remind");
  await api(request, user).post("/api/bills", {
    name: "Water bill",
    amount: 640,
    dueDate: new Date(Date.now() + DAY).toISOString(),
    status: "pending",
    category: "utilities",
  });
  await signInAs(page, user);
  await page.goto("/dashboard");

  const bell = page.getByRole("button", { name: /Notifications \(1 unread\)/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByText("Payment Due Soon: Water bill")).toBeVisible();
  await expect(page.getByText(/₹640\.00 is due tomorrow/)).toBeVisible();
  await expectNoDollarSign(page, "notifications panel");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: /Notifications \(0 unread\)/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("restricts the admin panel to admins", async ({ page }, testInfo) => {
  const errors = trackPageErrors(page);
  await signInAs(page, uniqueUser(testInfo, "member"));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});

test("lets an admin manage users and pricing", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAs(page, ADMIN);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expectNoHorizontalOverflow(page, "admin dashboard");
  await expectNoDollarSign(page, "admin dashboard");

  await page.goto("/admin/users");
  await expect(page.getByText("e2e_admin@e2e.test").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "admin users");
  await expectNoDollarSign(page, "admin users");

  await page.goto("/admin/pricing");
  await expect(page.getByText("₹0").first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "admin pricing");
  await expectNoDollarSign(page, "admin pricing");
  expect(errors).toEqual([]);
});
