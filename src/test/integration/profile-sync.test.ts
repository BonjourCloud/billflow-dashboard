import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startHarness, type Harness } from "./harness";
import { fakeClerkClient, registerClerkUser } from "./fakeClerk";
import { PROFILE_SYNC_TTL_MS, User } from "../../../server/src/index";

const OWNER = "user_owner";
const ALICE = "user_alice";
const BOB = "user_bob";

describe("Clerk profile sync is cached per user; roles are not", () => {
  let harness: Harness;
  let getUserSpy: ReturnType<typeof vi.spyOn>;
  const originalAdminIds = process.env.ADMIN_CLERK_USER_IDS;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
    process.env.ADMIN_CLERK_USER_IDS = originalAdminIds;
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await harness.resetDatabase();
    process.env.ADMIN_CLERK_USER_IDS = OWNER;
    registerClerkUser({ id: OWNER, email: "owner@example.com" });
    registerClerkUser({ id: ALICE, email: "alice@example.com", firstName: "Alice" });
    registerClerkUser({ id: BOB, email: "bob@example.com", firstName: "Bob" });
    getUserSpy = vi.spyOn(fakeClerkClient.users, "getUser");
  });

  const role = (user: string) =>
    harness.request<{ role: string }>("GET", "/api/users/me/role", { user });

  const clerkCallsFor = (user: string) =>
    getUserSpy.mock.calls.filter(([id]) => id === user).length;

  it("calls Clerk once per user within the TTL", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await role(ALICE)).body).toEqual({ role: "user" });
    }
    const me = await harness.request<{ email: string; displayName: string }>(
      "GET",
      "/api/users/me",
      { user: ALICE },
    );
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: "alice@example.com", displayName: "Alice" });
    expect(clerkCallsFor(ALICE)).toBe(1);
  });

  it("keeps each user's sync independent", async () => {
    await role(ALICE);
    await role(BOB);
    await role(ALICE);

    expect(clerkCallsFor(ALICE)).toBe(1);
    expect(clerkCallsFor(BOB)).toBe(1);
    const bob = await User.findOne({ clerkUserId: BOB }).lean();
    expect(bob).toMatchObject({ email: "bob@example.com", displayName: "Bob" });
  });

  it("re-syncs from Clerk once the TTL has passed", async () => {
    await role(ALICE);
    registerClerkUser({ id: ALICE, email: "alice.new@example.com", firstName: "Alicia" });

    // Within the TTL the old profile is kept.
    await role(ALICE);
    expect((await User.findOne({ clerkUserId: ALICE }).lean())?.email).toBe(
      "alice@example.com",
    );

    await User.updateOne(
      { clerkUserId: ALICE },
      { $set: { profileSyncedAt: new Date(Date.now() - PROFILE_SYNC_TTL_MS - 1000) } },
    );
    await role(ALICE);

    expect(clerkCallsFor(ALICE)).toBe(2);
    expect(await User.findOne({ clerkUserId: ALICE }).lean()).toMatchObject({
      email: "alice.new@example.com",
      displayName: "Alicia",
    });
  });

  it("applies grants and revocations immediately despite a fresh profile", async () => {
    expect((await role(BOB)).body.role).toBe("user");

    await harness.request("POST", `/api/admin/users/${BOB}/grant-admin`, {
      user: OWNER,
      body: {},
    });
    expect((await role(BOB)).body.role).toBe("admin");

    await harness.request("POST", `/api/admin/users/${BOB}/revoke-admin`, {
      user: OWNER,
      body: {},
    });
    expect((await role(BOB)).body.role).toBe("user");
    expect(
      (await harness.request("GET", "/api/admin/summary", { user: BOB })).status,
    ).toBe(403);
  });

  it("applies ADMIN_CLERK_USER_IDS changes immediately", async () => {
    expect((await role(OWNER)).body.role).toBe("admin");

    process.env.ADMIN_CLERK_USER_IDS = "";
    expect((await role(OWNER)).body.role).toBe("user");

    process.env.ADMIN_CLERK_USER_IDS = OWNER;
    expect((await role(OWNER)).body.role).toBe("admin");
    expect(clerkCallsFor(OWNER)).toBe(1);
  });

  it("truncates long Clerk display names instead of failing", async () => {
    registerClerkUser({ id: ALICE, email: "alice@example.com", firstName: "A".repeat(200) });

    const me = await harness.request<{ displayName: string }>("GET", "/api/users/me", {
      user: ALICE,
    });

    expect(me.status).toBe(200);
    expect(me.body.displayName).toHaveLength(120);
  });

  it("returns 500 without caching when the Clerk lookup fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserSpy.mockRejectedValueOnce(new Error("Clerk outage"));

    expect((await role(ALICE)).status).toBe(500);
    expect(await User.countDocuments({ clerkUserId: ALICE })).toBe(0);

    // The next request retries Clerk rather than trusting a failed sync.
    expect((await role(ALICE)).status).toBe(200);
    expect(clerkCallsFor(ALICE)).toBe(2);
    consoleSpy.mockRestore();
  });
});
