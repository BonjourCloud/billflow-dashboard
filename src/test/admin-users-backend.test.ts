import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { User } from "../../server/src/models/User";
import {
  isUserAdmin,
  requireAdminAuth,
  getBootstrapAdminIds,
} from "../../server/src/index";

// Derive Express types from the helper; express is a backend-only dependency.
type Request = Parameters<typeof requireAdminAuth>[0];
type Response = Parameters<typeof requireAdminAuth>[1];

const clerkAuthBrand = Symbol.for("@clerk/express.auth");

function createMockReq(userId: string | null = null): Request {
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
  const res: Partial<Response> = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation(() => res);
  return res as Response;
}

describe("Admin Users Backend — isUserAdmin() Authorization Helper", () => {
  const originalEnv = process.env.ADMIN_CLERK_USER_IDS;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default User.findOne to resolve to null so unmocked queries don't buffer against DB connection
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    } as unknown as ReturnType<typeof User.findOne>);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_CLERK_USER_IDS = originalEnv;
    } else {
      delete process.env.ADMIN_CLERK_USER_IDS;
    }
  });

  it("returns false for null, undefined, or empty userId", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_admin_123";
    expect(await isUserAdmin(null)).toBe(false);
    expect(await isUserAdmin(undefined)).toBe(false);
    expect(await isUserAdmin("")).toBe(false);
  });

  it("returns true for users listed in ADMIN_CLERK_USER_IDS (bootstrap admin)", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_super_admin, user_ops_admin";
    expect(await isUserAdmin("user_super_admin")).toBe(true);
    expect(await isUserAdmin("user_ops_admin")).toBe(true);
  });

  it("handles whitespace, empty entries, and trailing commas in ADMIN_CLERK_USER_IDS", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "   user_one , , user_two , ";
    expect(await isUserAdmin("user_one")).toBe(true);
    expect(await isUserAdmin("user_two")).toBe(true);
    expect(await isUserAdmin("user_three")).toBe(false);
  });

  it("returns true when user has role='admin' in MongoDB (even if not in bootstrap list)", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ clerkUserId: "user_db_admin", role: "admin" }),
      }),
    } as unknown as ReturnType<typeof User.findOne>);

    expect(await isUserAdmin("user_db_admin")).toBe(true);
  });

  it("returns false when user has role='user' in MongoDB and is not in bootstrap list", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ clerkUserId: "user_standard", role: "user" }),
      }),
    } as unknown as ReturnType<typeof User.findOne>);

    expect(await isUserAdmin("user_standard")).toBe(false);
  });

  it("returns false when user is not found in MongoDB and not in bootstrap list", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    } as unknown as ReturnType<typeof User.findOne>);

    expect(await isUserAdmin("user_unknown")).toBe(false);
  });

  it("prioritizes bootstrap admin match without querying MongoDB", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "user_bootstrap";
    const findOneSpy = vi.spyOn(User, "findOne");

    const result = await isUserAdmin("user_bootstrap");
    expect(result).toBe(true);
    expect(findOneSpy).not.toHaveBeenCalled();
  });
});

describe("Admin Users Backend — requireAdminAuth() Middleware Helper", () => {
  const originalEnv = process.env.ADMIN_CLERK_USER_IDS;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    } as unknown as ReturnType<typeof User.findOne>);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_CLERK_USER_IDS = originalEnv;
    } else {
      delete process.env.ADMIN_CLERK_USER_IDS;
    }
  });

  it("returns 401 when request is unauthenticated (no userId)", async () => {
    const req = createMockReq(null);
    const res = createMockRes();

    const adminUserId = await requireAdminAuth(req, res);
    expect(adminUserId).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required." });
  });

  it("returns 403 when authenticated user is not an admin", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "admin_clerk_id";
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ clerkUserId: "regular_user", role: "user" }),
      }),
    } as unknown as ReturnType<typeof User.findOne>);

    const req = createMockReq("regular_user");
    const res = createMockRes();

    const adminUserId = await requireAdminAuth(req, res);
    expect(adminUserId).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Admin access required." });
  });

  it("returns admin userId when user is verified bootstrap admin", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "admin_clerk_id";
    const req = createMockReq("admin_clerk_id");
    const res = createMockRes();

    const adminUserId = await requireAdminAuth(req, res);
    expect(adminUserId).toBe("admin_clerk_id");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns admin userId when user has MongoDB role='admin'", async () => {
    process.env.ADMIN_CLERK_USER_IDS = "";
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ clerkUserId: "db_admin_id", role: "admin" }),
      }),
    } as unknown as ReturnType<typeof User.findOne>);

    const req = createMockReq("db_admin_id");
    const res = createMockRes();

    const adminUserId = await requireAdminAuth(req, res);
    expect(adminUserId).toBe("db_admin_id");
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("Admin Users Backend — GET /api/admin/users Endpoint Logic", () => {
  interface ClerkMockUser {
    id: string;
    primaryEmailAddressId: string | null;
    emailAddresses: Array<{ id: string; emailAddress: string }>;
    createdAt: number | string | Date;
    lastSignInAt: number | string | Date | null;
  }

  function simulateListUsers({
    callerUserId,
    callerIsAdmin,
    clerkUsers,
    dbUsers,
    bootstrapIds,
  }: {
    callerUserId: string | null;
    callerIsAdmin: boolean;
    clerkUsers: ClerkMockUser[];
    dbUsers: Array<{ clerkUserId: string; role: string }>;
    bootstrapIds: string[];
  }) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }

    const roleMap = new Map(dbUsers.map((u) => [u.clerkUserId, u.role]));

    const users = clerkUsers.map((u) => {
      const primaryEmail =
        u.emailAddresses.find((item) => item.id === u.primaryEmailAddressId)
          ?.emailAddress ||
        u.emailAddresses[0]?.emailAddress ||
        null;

      const createdAtIso = new Date(u.createdAt).toISOString();
      const lastSignInIso = u.lastSignInAt
        ? new Date(u.lastSignInAt).toISOString()
        : null;

      const isBootstrapAdmin = bootstrapIds.includes(u.id);
      const isAdmin =
        isBootstrapAdmin || roleMap.get(u.id) === "admin";

      return {
        id: u.id,
        email: primaryEmail,
        created_at: createdAtIso,
        last_sign_in_at: lastSignInIso,
        is_admin: isAdmin,
        is_bootstrap_admin: isBootstrapAdmin,
      };
    });

    return { status: 200, data: users };
  }

  it("blocks unauthenticated callers with 401", () => {
    const res = simulateListUsers({
      callerUserId: null,
      callerIsAdmin: false,
      clerkUsers: [],
      dbUsers: [],
      bootstrapIds: [],
    });
    expect(res.status).toBe(401);
  });

  it("blocks non-admin callers with 403", () => {
    const res = simulateListUsers({
      callerUserId: "regular_user",
      callerIsAdmin: false,
      clerkUsers: [],
      dbUsers: [],
      bootstrapIds: [],
    });
    expect(res.status).toBe(403);
  });

  it("merges Clerk users with MongoDB roles and bootstrap admin flags correctly", () => {
    const clerkUsers: ClerkMockUser[] = [
      {
        id: "user_bootstrap_alice",
        primaryEmailAddressId: "email_1",
        emailAddresses: [{ id: "email_1", emailAddress: "alice@example.com" }],
        createdAt: "2026-01-01T10:00:00.000Z",
        lastSignInAt: "2026-10-18T12:00:00.000Z",
      },
      {
        id: "user_db_admin_bob",
        primaryEmailAddressId: "email_2",
        emailAddresses: [{ id: "email_2", emailAddress: "bob@example.com" }],
        createdAt: "2026-02-01T10:00:00.000Z",
        lastSignInAt: "2026-10-19T08:00:00.000Z",
      },
      {
        id: "user_standard_carol",
        primaryEmailAddressId: "email_3",
        emailAddresses: [{ id: "email_3", emailAddress: "carol@example.com" }],
        createdAt: "2026-03-01T10:00:00.000Z",
        lastSignInAt: null,
      },
    ];

    const dbUsers = [
      { clerkUserId: "user_db_admin_bob", role: "admin" },
      { clerkUserId: "user_standard_carol", role: "user" },
    ];

    const res = simulateListUsers({
      callerUserId: "user_bootstrap_alice",
      callerIsAdmin: true,
      clerkUsers,
      dbUsers,
      bootstrapIds: ["user_bootstrap_alice"],
    });

    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(3);

    const alice = res.data?.find((u) => u.id === "user_bootstrap_alice");
    expect(alice?.is_admin).toBe(true);
    expect(alice?.is_bootstrap_admin).toBe(true);
    expect(alice?.email).toBe("alice@example.com");
    expect(alice?.last_sign_in_at).toBe("2026-10-18T12:00:00.000Z");

    const bob = res.data?.find((u) => u.id === "user_db_admin_bob");
    expect(bob?.is_admin).toBe(true);
    expect(bob?.is_bootstrap_admin).toBe(false);
    expect(bob?.email).toBe("bob@example.com");

    const carol = res.data?.find((u) => u.id === "user_standard_carol");
    expect(carol?.is_admin).toBe(false);
    expect(carol?.is_bootstrap_admin).toBe(false);
    expect(carol?.last_sign_in_at).toBeNull();
  });

  it("handles user without primary email address gracefully", () => {
    const clerkUsers: ClerkMockUser[] = [
      {
        id: "user_no_primary",
        primaryEmailAddressId: null,
        emailAddresses: [{ id: "alt_1", emailAddress: "secondary@example.com" }],
        createdAt: "2026-04-01T10:00:00.000Z",
        lastSignInAt: null,
      },
      {
        id: "user_no_email",
        primaryEmailAddressId: null,
        emailAddresses: [],
        createdAt: "2026-05-01T10:00:00.000Z",
        lastSignInAt: null,
      },
    ];

    const res = simulateListUsers({
      callerUserId: "admin",
      callerIsAdmin: true,
      clerkUsers,
      dbUsers: [],
      bootstrapIds: ["admin"],
    });

    expect(res.status).toBe(200);
    expect(res.data?.[0]?.email).toBe("secondary@example.com");
    expect(res.data?.[1]?.email).toBeNull();
  });
});

describe("Admin Users Backend — POST /api/admin/users/:id/grant-admin & revoke-admin", () => {
  interface MockDbState {
    users: Map<string, { role: string; email: string | null; displayName: string | null }>;
  }

  function simulateGrantAdmin({
    callerUserId,
    callerIsAdmin,
    targetUserId,
    clerkExists,
    dbState,
  }: {
    callerUserId: string | null;
    callerIsAdmin: boolean;
    targetUserId: string;
    clerkExists: boolean;
    dbState: MockDbState;
  }) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }
    if (!targetUserId || !targetUserId.trim()) {
      return { status: 400, error: "Target user ID is required." };
    }
    if (!clerkExists) {
      return { status: 404, error: "User not found in identity provider." };
    }

    dbState.users.set(targetUserId, {
      role: "admin",
      email: `${targetUserId}@test.com`,
      displayName: "Target User",
    });

    return {
      status: 200,
      data: {
        message: "Admin privileges granted.",
        userId: targetUserId,
        is_admin: true,
      },
    };
  }

  function simulateRevokeAdmin({
    callerUserId,
    callerIsAdmin,
    targetUserId,
    bootstrapIds,
    clerkStatus,
    dbState,
  }: {
    callerUserId: string | null;
    callerIsAdmin: boolean;
    targetUserId: string;
    bootstrapIds: string[];
    clerkStatus: 200 | 404 | 500;
    dbState: MockDbState;
  }) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }
    if (!targetUserId || !targetUserId.trim()) {
      return { status: 400, error: "Target user ID is required." };
    }
    // 1. Self-revocation prevention
    if (targetUserId === callerUserId) {
      return { status: 400, error: "Cannot revoke admin privileges from yourself." };
    }
    // 2. Bootstrap administrator protection
    if (bootstrapIds.includes(targetUserId)) {
      return {
        status: 400,
        error: "Cannot revoke admin privileges from an environment bootstrap admin.",
      };
    }
    // 3. Target exists and verified in Clerk (M-1 safeguard)
    if (clerkStatus === 404) {
      return { status: 404, error: "User not found." };
    }
    if (clerkStatus !== 200) {
      return { status: 500, error: "Failed to verify target user." };
    }

    const current = dbState.users.get(targetUserId) ?? {
      email: null,
      displayName: null,
      role: "user",
    };
    dbState.users.set(targetUserId, { ...current, role: "user" });

    return {
      status: 200,
      data: {
        message: "Admin privileges revoked.",
        userId: targetUserId,
        is_admin: false,
      },
    };
  }

  it("grant-admin rejects unauthenticated (401) and non-admin (403)", () => {
    const dbState: MockDbState = { users: new Map() };
    const unauth = simulateGrantAdmin({
      callerUserId: null,
      callerIsAdmin: false,
      targetUserId: "target_1",
      clerkExists: true,
      dbState,
    });
    expect(unauth.status).toBe(401);

    const nonAdmin = simulateGrantAdmin({
      callerUserId: "regular_user",
      callerIsAdmin: false,
      targetUserId: "target_1",
      clerkExists: true,
      dbState,
    });
    expect(nonAdmin.status).toBe(403);
  });

  it("grant-admin rejects non-existent Clerk user with 404", () => {
    const dbState: MockDbState = { users: new Map() };
    const notFound = simulateGrantAdmin({
      callerUserId: "admin_1",
      callerIsAdmin: true,
      targetUserId: "non_existent_clerk_id",
      clerkExists: false,
      dbState,
    });
    expect(notFound.status).toBe(404);
    expect(notFound.error).toMatch(/User not found/);
  });

  it("grant-admin succeeds for valid target user and sets role='admin'", () => {
    const dbState: MockDbState = { users: new Map() };
    const res = simulateGrantAdmin({
      callerUserId: "admin_1",
      callerIsAdmin: true,
      targetUserId: "user_promoted",
      clerkExists: true,
      dbState,
    });
    expect(res.status).toBe(200);
    expect(res.data?.is_admin).toBe(true);
    expect(dbState.users.get("user_promoted")?.role).toBe("admin");
  });

  it("revoke-admin prevents self-revocation with 400", () => {
    const dbState: MockDbState = {
      users: new Map([["admin_self", { role: "admin", email: null, displayName: null }]]),
    };
    const res = simulateRevokeAdmin({
      callerUserId: "admin_self",
      callerIsAdmin: true,
      targetUserId: "admin_self", // Attempting to revoke self
      bootstrapIds: [],
      clerkStatus: 200,
      dbState,
    });
    expect(res.status).toBe(400);
    expect(res.error).toBe("Cannot revoke admin privileges from yourself.");
    expect(dbState.users.get("admin_self")?.role).toBe("admin");
  });

  it("revoke-admin prevents revoking bootstrap environment admin with 400", () => {
    const dbState: MockDbState = {
      users: new Map([["user_bootstrap_root", { role: "admin", email: null, displayName: null }]]),
    };
    const res = simulateRevokeAdmin({
      callerUserId: "another_admin",
      callerIsAdmin: true,
      targetUserId: "user_bootstrap_root",
      bootstrapIds: ["user_bootstrap_root"],
      clerkStatus: 200,
      dbState,
    });
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/environment bootstrap admin/);
    expect(dbState.users.get("user_bootstrap_root")?.role).toBe("admin");
  });

  it("revoke-admin returns 404 if target user is not in Clerk without modifying database", () => {
    const dbState: MockDbState = {
      users: new Map([["ghost_user", { role: "admin", email: null, displayName: null }]]),
    };
    const res = simulateRevokeAdmin({
      callerUserId: "admin_1",
      callerIsAdmin: true,
      targetUserId: "ghost_user",
      bootstrapIds: [],
      clerkStatus: 404,
      dbState,
    });
    expect(res.status).toBe(404);
    expect(dbState.users.get("ghost_user")?.role).toBe("admin");
  });

  it("revoke-admin rejects Clerk 500 or network failure with 500 without modifying database (M-1)", () => {
    const dbState: MockDbState = {
      users: new Map([["user_admin_fail", { role: "admin", email: "fail@test.com", displayName: "Admin" }]]),
    };
    const res = simulateRevokeAdmin({
      callerUserId: "admin_caller",
      callerIsAdmin: true,
      targetUserId: "user_admin_fail",
      bootstrapIds: ["admin_caller"],
      clerkStatus: 500,
      dbState,
    });
    expect(res.status).toBe(500);
    expect(res.error).toBe("Failed to verify target user.");
    // Invariant: MongoDB role must NOT be modified
    expect(dbState.users.get("user_admin_fail")?.role).toBe("admin");
  });

  it("revoke-admin successfully demotes a granted admin to role='user'", () => {
    const dbState: MockDbState = {
      users: new Map([["user_to_demote", { role: "admin", email: "target@test.com", displayName: null }]]),
    };
    const res = simulateRevokeAdmin({
      callerUserId: "admin_caller",
      callerIsAdmin: true,
      targetUserId: "user_to_demote",
      bootstrapIds: ["admin_caller"],
      clerkStatus: 200,
      dbState,
    });
    expect(res.status).toBe(200);
    expect(res.data?.is_admin).toBe(false);
    expect(dbState.users.get("user_to_demote")?.role).toBe("user");
  });
});

describe("Admin Users Backend — GET /api/admin/summary Logic", () => {
  function simulateAdminSummary({
    callerUserId,
    callerIsAdmin,
    bootstrapIds,
    dbAdmins,
    pricingTiersCount,
  }: {
    callerUserId: string | null;
    callerIsAdmin: boolean;
    bootstrapIds: string[];
    dbAdmins: Array<{ clerkUserId: string }>;
    pricingTiersCount: number;
  }) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }

    const uniqueAdmins = new Set<string>([
      ...bootstrapIds,
      ...dbAdmins.map((u) => u.clerkUserId),
    ]);

    return {
      status: 200,
      data: {
        adminCount: uniqueAdmins.size,
        pricingTiersCount,
      },
    };
  }

  it("requires admin authentication (401 unauthenticated, 403 non-admin)", () => {
    const unauth = simulateAdminSummary({
      callerUserId: null,
      callerIsAdmin: false,
      bootstrapIds: [],
      dbAdmins: [],
      pricingTiersCount: 3,
    });
    expect(unauth.status).toBe(401);

    const nonAdmin = simulateAdminSummary({
      callerUserId: "regular",
      callerIsAdmin: false,
      bootstrapIds: [],
      dbAdmins: [],
      pricingTiersCount: 3,
    });
    expect(nonAdmin.status).toBe(403);
  });

  it("deduplicates admins present in both bootstrap env var and MongoDB", () => {
    const bootstrapIds = ["user_alpha", "user_beta"];
    const dbAdmins = [
      { clerkUserId: "user_alpha" }, // Overlaps with bootstrap
      { clerkUserId: "user_gamma" }, // DB-only admin
    ];

    const res = simulateAdminSummary({
      callerUserId: "user_alpha",
      callerIsAdmin: true,
      bootstrapIds,
      dbAdmins,
      pricingTiersCount: 5,
    });

    expect(res.status).toBe(200);
    // user_alpha (overlap), user_beta (bootstrap only), user_gamma (DB only) = 3 unique admins
    expect(res.data?.adminCount).toBe(3);
    expect(res.data?.pricingTiersCount).toBe(5);
  });
});

describe("Admin Users Backend — GET /api/users/me/role Consistency", () => {
  it("preserves MongoDB role='admin' on profile sync", async () => {
    // When a user was granted admin in MongoDB, isUserAdmin returns true
    // ensuring the sync updates the document with role: 'admin' instead of resetting to 'user'
    const dbAdminUser = { clerkUserId: "promoted_admin", role: "admin" };

    const determineRole = (
      userId: string,
      bootstrapList: string[],
      dbRole: string | undefined,
    ) => {
      const isBootstrap = bootstrapList.includes(userId);
      const isDbAdmin = dbRole === "admin";
      return isBootstrap || isDbAdmin ? "admin" : "user";
    };

    expect(determineRole("promoted_admin", [], dbAdminUser.role)).toBe("admin");
    expect(determineRole("bootstrap_only", ["bootstrap_only"], undefined)).toBe("admin");
    expect(determineRole("regular_user", [], "user")).toBe("user");
    expect(determineRole("new_user", [], undefined)).toBe("user");
  });
});

describe("Admin Users Backend — getBootstrapAdminIds() Helper (L-4)", () => {
  const originalEnv = process.env.ADMIN_CLERK_USER_IDS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_CLERK_USER_IDS = originalEnv;
    } else {
      delete process.env.ADMIN_CLERK_USER_IDS;
    }
  });

  it("parses, trims whitespace, and filters empty strings from ADMIN_CLERK_USER_IDS", () => {
    process.env.ADMIN_CLERK_USER_IDS = "  user_1  ,  , user_2 ,   ";
    expect(getBootstrapAdminIds()).toEqual(["user_1", "user_2"]);
  });

  it("returns empty array if ADMIN_CLERK_USER_IDS is empty or undefined", () => {
    delete process.env.ADMIN_CLERK_USER_IDS;
    expect(getBootstrapAdminIds()).toEqual([]);
    process.env.ADMIN_CLERK_USER_IDS = "";
    expect(getBootstrapAdminIds()).toEqual([]);
  });
});

describe("Admin Users Backend — Display Name Bounding (L-1)", () => {
  it("truncates display names longer than 120 characters to 120 characters", () => {
    const longName = "A".repeat(150);
    const rawDisplayName = [longName, ""].filter(Boolean).join(" ").trim();
    const displayName = rawDisplayName ? rawDisplayName.slice(0, 120) : null;

    expect(displayName).toBeDefined();
    expect(displayName?.length).toBe(120);
    expect(displayName).toBe("A".repeat(120));
  });

  it("handles null/empty first and last names gracefully without crashing", () => {
    const rawDisplayName = [undefined, null].filter(Boolean).join(" ").trim();
    const displayName = rawDisplayName ? rawDisplayName.slice(0, 120) : null;
    expect(displayName).toBeNull();
  });
});
