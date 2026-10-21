import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

// @clerk/express is a backend-only dependency, so mock the copy the server
// actually loads.
vi.mock("../../server/node_modules/@clerk/express/dist/index.mjs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    clerkClient: { users: { getUser: getUserMock } },
  };
});

import { User } from "../../server/src/models/User";
import { currentUserRoleHandler } from "../../server/src/index";

// Derive Express types from the handler; express is a backend-only dependency.
type Request = Parameters<typeof currentUserRoleHandler>[0];
type Response = Parameters<typeof currentUserRoleHandler>[1];

const clerkAuthBrand = Symbol.for("@clerk/express.auth");

function createMockReq(userId: string | null): Request {
  const authHandler = Object.assign(
    () => ({
      tokenType: "session_token",
      userId,
      sessionId: userId ? `sess_${userId}` : null,
    }),
    { [clerkAuthBrand]: true },
  );
  return { auth: authHandler } as unknown as Request;
}

function createMockRes() {
  const res: Partial<Response> & { body?: unknown } = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as Response & { body?: unknown };
}

function mockStoredRole(role: "admin" | "user" | null) {
  vi.spyOn(User, "findOne").mockReturnValue({
    select: () => ({
      lean: () =>
        Promise.resolve(role ? { clerkUserId: "user_x", role } : null),
    }),
  } as unknown as ReturnType<typeof User.findOne>);
}

describe("Phase 4A — GET /api/users/me/role does not persist roles", () => {
  const originalEnv = process.env.ADMIN_CLERK_USER_IDS;
  let updateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      id: "user_bootstrap",
      primaryEmailAddressId: "email_1",
      emailAddresses: [{ id: "email_1", emailAddress: "owner@example.com" }],
      firstName: "Pat",
      lastName: "Lee",
      imageUrl: "https://img.example.com/a.png",
    });
    updateSpy = vi
      .spyOn(User, "findOneAndUpdate")
      .mockResolvedValue(null as never);
    mockStoredRole(null);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_CLERK_USER_IDS = originalEnv;
    } else {
      delete process.env.ADMIN_CLERK_USER_IDS;
    }
  });

  it("returns 401 without a signed-in user", async () => {
    const res = createMockRes();
    await currentUserRoleHandler(createMockReq(null), res);
    expect(res.statusCode).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("reports a bootstrap admin as admin without writing role to MongoDB", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    const res = createMockRes();

    await currentUserRoleHandler(createMockReq("user_bootstrap"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ role: "admin" });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const update = updateSpy.mock.calls[0][1] as {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    expect(update.$set).not.toHaveProperty("role");
    expect(update.$setOnInsert).not.toHaveProperty("role");
    expect(update.$set).toMatchObject({
      email: "owner@example.com",
      displayName: "Pat Lee",
    });
  });

  it("downgrades a former bootstrap admin once removed from ADMIN_CLERK_USER_IDS", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    await currentUserRoleHandler(createMockReq("user_bootstrap"), createMockRes());

    // Because nothing was persisted, the stored role is still the default.
    process.env.ADMIN_CLERK_USER_IDS = "";
    mockStoredRole("user");
    const res = createMockRes();
    await currentUserRoleHandler(createMockReq("user_bootstrap"), res);

    expect(res.body).toEqual({ role: "user" });
  });

  it("keeps admins granted through the admin panel (stored role)", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "";
    mockStoredRole("admin");
    const res = createMockRes();

    await currentUserRoleHandler(createMockReq("user_granted"), res);

    expect(res.body).toEqual({ role: "admin" });
    const update = updateSpy.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set).not.toHaveProperty("role");
  });

  it("returns a generic 500 when Clerk lookup fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserMock.mockRejectedValue(new Error("Clerk outage"));
    const res = createMockRes();

    await currentUserRoleHandler(createMockReq("user_any"), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load user role." });
    consoleSpy.mockRestore();
  });
});
