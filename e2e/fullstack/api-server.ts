/**
 * TEST-ONLY API server for the full-stack browser journeys.
 *
 * Runs the real Express app (server/src/index.ts) against an in-memory MongoDB
 * replica set. Clerk is replaced: requests carry `Authorization: Bearer e2e:<userId>`
 * from the fake frontend SDK, and the Clerk Backend API client is stubbed.
 * Never deploy or import this file from application code.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = Number(process.env.E2E_API_PORT ?? 5175);
const FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN ?? "http://127.0.0.1:4175";
export const E2E_ADMIN_ID = "user_e2e_admin";
export const E2E_DEMO_ID = "user_e2edemo";

// NODE_ENV=test skips production env validation and the real clerkMiddleware
// (which is only registered when both Clerk keys are set). The placeholder
// secret key lets @clerk/express create one client whose methods we stub.
process.env.NODE_ENV = "test";
process.env.CLERK_SECRET_KEY = "sk_test_e2e_stub";
delete process.env.CLERK_PUBLISHABLE_KEY;
process.env.ADMIN_CLERK_USER_IDS = E2E_ADMIN_ID;
process.env.DEMO_CLERK_USER_ID = E2E_DEMO_ID;

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});

const { app, mongoose, seedPricingTiersIfEmpty } = await import("../../server/src/index.ts");
const { clerkClient } = await import("../../server/node_modules/@clerk/express/dist/index.mjs");
const { default: express } = await import("../../server/node_modules/express/index.js");
const { default: cors } = await import("../../server/node_modules/cors/lib/index.js");

await mongoose.connect(replSet.getUri("billwill-e2e"));
await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
await seedPricingTiersIfEmpty();

// Clerk Backend API stand-in: every user ID is a valid test user.
const knownUsers = new Set<string>([E2E_ADMIN_ID]);
function fakeClerkUser(id: string) {
  knownUsers.add(id);
  const handle = id.replace(/^user_/, "");
  return {
    id,
    primaryEmailAddressId: `idn_${id}`,
    emailAddresses: [{ id: `idn_${id}`, emailAddress: `${handle}@e2e.test` }],
    firstName: handle.split("_").slice(-1)[0] ?? "Test",
    lastName: "User",
    imageUrl: "",
    createdAt: Date.UTC(2026, 0, 1),
    lastSignInAt: null,
  };
}
const users = clerkClient.users as unknown as Record<string, unknown>;
users.getUser = async (id: string) => fakeClerkUser(id);
users.getUserList = async ({ limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}) => {
  const all = [...knownUsers].map(fakeClerkUser);
  return { data: all.slice(offset, offset + limit), totalCount: all.length };
};

// Demo sign-in ticket: the fake frontend SDK turns `e2e:<userId>` into a session.
// clerkClient is a lazy Proxy whose `set` trap rejects brand-new properties, so
// define the stub with Object.defineProperty instead of a plain assignment.
Object.defineProperty(clerkClient, "signInTokens", {
  configurable: true,
  value: {
    createSignInToken: async ({ userId }: { userId: string }) => ({ token: `e2e:${userId}` }),
  },
});

const clerkAuthBrand = Symbol.for("@clerk/express.auth");
const outer = express();
outer.use(cors({ origin: FRONTEND_ORIGIN }));
outer.use((req, _res, next) => {
  const match = /^Bearer e2e:(user_[A-Za-z0-9_]+)$/.exec(req.headers.authorization ?? "");
  const userId = match ? match[1] : null;
  (req as unknown as { auth: unknown }).auth = Object.assign(
    () => ({ tokenType: "session_token", userId, sessionId: userId ? `sess_${userId}` : null }),
    { [clerkAuthBrand]: true },
  );
  next();
});
outer.use(app);

const server = outer.listen(PORT, "127.0.0.1", () => {
  console.log(`E2E API (in-memory MongoDB, fake auth) on http://127.0.0.1:${PORT}`);
});

async function shutdown() {
  server.close();
  await mongoose.disconnect();
  await replSet.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
