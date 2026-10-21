import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
// express is a backend-only dependency; use the copy the server loads.
import express from "../../../server/node_modules/express/index.js";
import { app, mongoose } from "../../../server/src/index";
import { resetClerkUsers } from "./fakeClerk";

const clerkAuthBrand = Symbol.for("@clerk/express.auth");

export const TEST_USER_HEADER = "x-test-user-id";

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
}

export interface Harness {
  request<T = unknown>(
    method: string,
    path: string,
    options?: { user?: string | null; body?: unknown },
  ): Promise<TestResponse<T>>;
  resetDatabase(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Starts a single-node MongoDB replica set (so transactions work), connects
 * the server's mongoose, and serves the real Express app behind a stand-in for
 * clerkMiddleware. Like Clerk, it always sets req.auth; userId comes from the
 * x-test-user-id header and is null when the header is absent.
 */
export async function startHarness(): Promise<Harness> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri("billflow-test"));
  // Build unique/partial indexes up front so idempotency checks are enforced.
  await Promise.all(
    mongoose.modelNames().map((name) => mongoose.model(name).init()),
  );

  const outer = express();
  outer.use((req, _res, next) => {
    const header = req.headers[TEST_USER_HEADER];
    const userId = typeof header === "string" && header ? header : null;
    (req as unknown as { auth: unknown }).auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId,
        sessionId: userId ? `sess_${userId}` : null,
      }),
      { [clerkAuthBrand]: true },
    );
    next();
  });
  outer.use(app);

  const server = await new Promise<Server>((resolve) => {
    const instance = outer.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    async request<T>(
      method: string,
      path: string,
      options: { user?: string | null; body?: unknown } = {},
    ): Promise<TestResponse<T>> {
      const headers: Record<string, string> = {};
      if (options.user) headers[TEST_USER_HEADER] = options.user;
      if (options.body !== undefined) headers["content-type"] = "application/json";

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // Non-JSON body; keep the raw text so assertions can show it.
      }
      return { status: response.status, body: body as T };
    },

    async resetDatabase() {
      await Promise.all(
        Object.values(mongoose.connection.collections).map((collection) =>
          collection.deleteMany({}),
        ),
      );
      resetClerkUsers();
    },

    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mongoose.disconnect();
      await replSet.stop();
    },
  };
}

/** Returns every route registered on the Express app as [METHOD, path]. */
export function listRoutes(): Array<[string, string]> {
  const router = (app as unknown as {
    router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  }).router;
  const routes: Array<[string, string]> = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled) routes.push([method.toUpperCase(), layer.route.path]);
    }
  }
  return routes;
}
