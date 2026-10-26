// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
// Backend-only dependencies: use the copies the server loads, so this
// exercises the real Clerk middleware and token verification.
import express from "../../server/node_modules/express/index.js";
import {
  clerkMiddleware,
  getAuth,
} from "../../server/node_modules/@clerk/express/dist/index.mjs";
import { buildClerkMiddlewareOptions } from "../../server/src/index";
import { validateServerEnv } from "../../server/src/config/env";

const FRONTEND = "https://app.example.com";
const LOCAL_FRONTEND = "http://localhost:8080";

// A syntactically valid publishable key for a fictional instance. With
// `jwtKey` set, verification happens locally and Clerk is never contacted.
const PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
const SECRET_KEY = "sk_test_authorized_parties_test";

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signSessionToken(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "ins_test" }));
  const payload = base64url(
    JSON.stringify({
      sub: "user_alice",
      sid: "sess_alice",
      iss: "https://example.clerk.accounts.dev",
      iat: now - 5,
      nbf: now - 5,
      exp: now + 60,
      ...claims,
    }),
  );
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

describe("Clerk authorizedParties (real @clerk/express middleware)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Origins come from the same validated CLIENT_URL list that CORS uses.
    const env = validateServerEnv({
      NODE_ENV: "production",
      CLIENT_URL: `${FRONTEND}/, ${LOCAL_FRONTEND}`,
      MONGODB_URI: "mongodb+srv://user:pass@cluster.example.net/billwill",
      CLERK_SECRET_KEY: SECRET_KEY,
      CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    });

    const testApp = express();
    testApp.use(
      clerkMiddleware({
        ...buildClerkMiddlewareOptions({
          publishableKey: PUBLISHABLE_KEY,
          secretKey: SECRET_KEY,
          authorizedOrigins: env.CLIENT_ORIGINS,
        }),
        jwtKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      }),
    );
    testApp.get("/whoami", (req, res) => {
      res.json({ userId: getAuth(req).userId ?? null });
    });

    server = await new Promise<Server>((resolve) => {
      const instance = testApp.listen(0, "127.0.0.1", () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function whoami(token: string): Promise<string | null> {
    const response = await fetch(`${baseUrl}/whoami`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    return (await response.json()).userId;
  }

  it("passes the validated CORS origins as authorized parties", () => {
    const options = buildClerkMiddlewareOptions({
      publishableKey: PUBLISHABLE_KEY,
      secretKey: SECRET_KEY,
      authorizedOrigins: [FRONTEND, LOCAL_FRONTEND],
    });
    expect(options.authorizedParties).toEqual([FRONTEND, LOCAL_FRONTEND]);
  });

  it("accepts tokens issued to a configured frontend origin", async () => {
    expect(await whoami(signSessionToken(privateKey, { azp: FRONTEND }))).toBe("user_alice");
    expect(await whoami(signSessionToken(privateKey, { azp: LOCAL_FRONTEND }))).toBe(
      "user_alice",
    );
  });

  it("treats tokens issued to another origin as signed out", async () => {
    for (const azp of [
      "https://evil.example.com",
      "https://app.example.com.evil.test",
      "http://app.example.com",
      "https://app.example.com/",
    ]) {
      expect(await whoami(signSessionToken(privateKey, { azp }))).toBeNull();
    }
  });

  it("treats tokens without an azp claim as signed out", async () => {
    expect(await whoami(signSessionToken(privateKey, {}))).toBeNull();
  });

  it("still rejects tokens with a valid azp but a foreign signature", async () => {
    expect(
      await whoami(signSessionToken(otherKeys.privateKey, { azp: FRONTEND })),
    ).toBeNull();
  });
});
