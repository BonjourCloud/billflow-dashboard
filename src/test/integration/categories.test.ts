import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";
import { Category } from "../../../server/src/models/Category";

const ALICE = "user_alice";
const ADMIN = "user_admin";

interface CategoryBody {
  id: string;
  slug: string;
  label: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

describe("Admin-managed categories through the real API", () => {
  let harness: Harness;
  const originalAdminIds = process.env.ADMIN_CLERK_USER_IDS;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
    process.env.ADMIN_CLERK_USER_IDS = originalAdminIds;
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    process.env.ADMIN_CLERK_USER_IDS = ADMIN;
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
    registerClerkUser({ id: ADMIN, email: "admin@example.com" });
  });

  const as = (user: string) => ({
    get: <T = unknown>(path: string) => harness.request<T>("GET", path, { user }),
    post: <T = unknown>(path: string, body: unknown = {}) =>
      harness.request<T>("POST", path, { user, body }),
    patch: <T = unknown>(path: string, body: unknown = {}) =>
      harness.request<T>("PATCH", path, { user, body }),
    del: <T = unknown>(path: string) => harness.request<T>("DELETE", path, { user }),
  });
  const alice = as(ALICE);
  const admin = as(ADMIN);

  const billBody = (category: string) => ({
    name: "Car EMI",
    amount: 18500,
    dueDate: "2027-01-05T00:00:00.000Z",
    status: "pending",
    category,
  });

  it("serves the built-in defaults to signed-in users even before seeding", async () => {
    const res = await alice.get<CategoryBody[]>("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.slug)).toEqual(
      expect.arrayContaining(["utilities", "housing", "loans", "groceries"]),
    );
    expect(res.body.every((c) => c.is_active)).toBe(true);
  });

  it("lets only admins create categories, then offers them to every user", async () => {
    expect((await alice.post("/api/admin/categories", { label: "Pet Care" })).status).toBe(403);

    const created = await admin.post<CategoryBody>("/api/admin/categories", {
      label: "  Car EMI ",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.slug).toBe("car-emi");
    expect(created.body.label).toBe("Car EMI");
    expect(created.body.color).toMatch(/^#[0-9a-f]{6}$/);

    const list = await alice.get<CategoryBody[]>("/api/categories");
    const slugs = list.body.map((c) => c.slug);
    // Creating the first custom category materialises the defaults too.
    expect(slugs).toEqual(expect.arrayContaining(["utilities", "car-emi"]));
    expect(await Category.countDocuments()).toBe(13);
  });

  it("rejects duplicate names (case-insensitive) and invalid input", async () => {
    await admin.post("/api/admin/categories", { label: "Pet Care" });
    expect((await admin.post("/api/admin/categories", { label: "pet care" })).status).toBe(409);
    expect((await admin.post("/api/admin/categories", { label: "utilities" })).status).toBe(409);
    expect((await admin.post("/api/admin/categories", { label: "   " })).status).toBe(400);
    expect((await admin.post("/api/admin/categories", { label: "x".repeat(31) })).status).toBe(400);
    expect(
      (await admin.post("/api/admin/categories", { label: "Ok", color: "red" })).status,
    ).toBe(400);
    expect(
      (await admin.post("/api/admin/categories", { label: "Ok", slug: "hack" })).status,
    ).toBe(400);
  });

  it("lets users use a new category for bills, subscriptions and installments", async () => {
    expect((await alice.post("/api/bills", billBody("car-emi"))).status).toBe(400);

    await admin.post("/api/admin/categories", { label: "Car EMI" });

    const bill = await alice.post<{ category: string }>("/api/bills", billBody("car-emi"));
    expect(bill.status, JSON.stringify(bill.body)).toBe(201);
    expect(bill.body.category).toBe("car-emi");

    const recurring = await alice.post("/api/bills", {
      ...billBody("car-emi"),
      recurrenceType: "recurring",
      recurringDay: 5,
    });
    expect(recurring.status, JSON.stringify(recurring.body)).toBe(201);

    const sub = await alice.post("/api/subscriptions", {
      name: "Car EMI",
      amount: 18500,
      category: "car-emi",
      startDate: "2027-01-05",
    });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);

    const plan = await alice.post<{ plan: { category: string } }>("/api/installments", {
      name: "Car loan",
      principalAmount: 600000,
      totalInstallments: 12,
      startDate: "2027-01-05",
      category: "car-emi",
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    expect(plan.body.plan.category).toBe("car-emi");
  });

  it("defaults a plan without a category to finance", async () => {
    const plan = await alice.post<{ plan: { category: string } }>("/api/installments", {
      name: "Phone",
      principalAmount: 60000,
      totalInstallments: 6,
      startDate: "2027-01-05",
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    expect(plan.body.plan.category).toBe("finance");
  });

  it("stops new use of a deactivated category but keeps existing bills editable", async () => {
    const car = await admin.post<CategoryBody>("/api/admin/categories", { label: "Car EMI" });
    const bill = await alice.post<{ _id: string }>("/api/bills", billBody("car-emi"));

    const off = await admin.patch<CategoryBody>(`/api/admin/categories/${car.body.id}`, {
      is_active: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.is_active).toBe(false);

    // Still listed (so labels resolve) but flagged inactive.
    const list = await alice.get<CategoryBody[]>("/api/categories");
    expect(list.body.find((c) => c.slug === "car-emi")?.is_active).toBe(false);

    expect((await alice.post("/api/bills", billBody("car-emi"))).status).toBe(400);

    // Existing bill: renaming keeps its category; moving to the inactive one from another is blocked.
    const rename = await alice.patch(`/api/bills/${bill.body._id}`, {
      name: "Car EMI (HDFC)",
      category: "car-emi",
    });
    expect(rename.status, JSON.stringify(rename.body)).toBe(200);

    const other = await alice.post<{ _id: string }>("/api/bills", billBody("housing"));
    expect(
      (await alice.patch(`/api/bills/${other.body._id}`, { category: "car-emi" })).status,
    ).toBe(400);

    await admin.patch(`/api/admin/categories/${car.body.id}`, { is_active: true });
    expect((await alice.post("/api/bills", billBody("car-emi"))).status).toBe(201);
  });

  it("renames and recolors without changing the slug", async () => {
    const created = await admin.post<CategoryBody>("/api/admin/categories", { label: "Pets" });
    const updated = await admin.patch<CategoryBody>(`/api/admin/categories/${created.body.id}`, {
      label: "Pet Care",
      color: "#AA00BB",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ slug: "pets", label: "Pet Care", color: "#aa00bb" });

    expect(
      (await admin.patch(`/api/admin/categories/${created.body.id}`, { slug: "x" })).status,
    ).toBe(400);
    expect((await admin.patch(`/api/admin/categories/${created.body.id}`, {})).status).toBe(400);
    expect(
      (await admin.patch(`/api/admin/categories/${created.body.id}`, { label: "Utilities" })).status,
    ).toBe(409);
  });

  it("refuses to delete a category that bills use, but deletes unused ones", async () => {
    const car = await admin.post<CategoryBody>("/api/admin/categories", { label: "Car EMI" });
    const pets = await admin.post<CategoryBody>("/api/admin/categories", { label: "Pets" });
    await alice.post("/api/bills", billBody("car-emi"));

    const blocked = await admin.del<{ error: string }>(`/api/admin/categories/${car.body.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/deactivate/i);
    expect(await Bill.countDocuments({ category: "car-emi" })).toBe(1);

    expect((await admin.del(`/api/admin/categories/${pets.body.id}`)).status).toBe(200);
    expect(await Category.countDocuments({ slug: "pets" })).toBe(0);
    expect((await admin.del(`/api/admin/categories/${pets.body.id}`)).status).toBe(404);
  });

  it("always keeps at least one active category", async () => {
    await Category.create({ slug: "only", label: "Only", color: "#112233", sort_order: 1 });
    const only = await Category.findOne({ slug: "only" }).lean();
    const id = String(only?._id);

    const off = await admin.patch<{ error: string }>(`/api/admin/categories/${id}`, {
      is_active: false,
    });
    expect(off.status).toBe(400);
    expect((await admin.del(`/api/admin/categories/${id}`)).status).toBe(400);
  });
});
