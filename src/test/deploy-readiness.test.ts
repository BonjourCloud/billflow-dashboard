// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
// express is a backend-only dependency; use the copy the server loads.
import express from "../../server/node_modules/express/index.js";
import { app, mongoose, createRateLimiter } from "../../server/src/index";

const repoRoot = resolve(__dirname, "../..");

async function listen(target: { listen: typeof app.listen }) {
  const server = await new Promise<Server>((done) => {
    const instance = target.listen(0, "127.0.0.1", () => done(instance));
  });
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function close(server: Server) {
  return new Promise<void>((done) => server.close(() => done()));
}

describe("Phase 4C — health and readiness endpoints", () => {
  let server: Server;
  let baseUrl: string;
  // readyState is a non-configurable getter after the first redefinition, so
  // install one spy for the suite and drive it through this variable.
  let dbReadyState = 0;

  beforeAll(async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockImplementation(
      () => dbReadyState,
    );
    ({ server, baseUrl } = await listen(app));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await close(server);
  });

  it("reports liveness with the database state", async () => {
    dbReadyState = 0;
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      database: "disconnected",
    });
  });

  it("returns 503 from /api/ready while MongoDB is not connected", async () => {
    dbReadyState = 2;
    const response = await fetch(`${baseUrl}/api/ready`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      database: "connecting",
    });
  });

  it("returns 200 from /api/ready once MongoDB is connected", async () => {
    dbReadyState = 1;
    const response = await fetch(`${baseUrl}/api/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      database: "connected",
    });
  });

  it("does not apply rate-limit headers to health probes", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.headers.get("ratelimit")).toBeNull();
  });

  it("applies the general rate limiter to API routes", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.headers.get("ratelimit-policy")).toMatch(/q=1000/);
  });
});

describe("Phase 4C — createRateLimiter", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const limited = express();
    limited.use(createRateLimiter({ windowMs: 60_000, limit: 2 }));
    limited.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });
    ({ server, baseUrl } = await listen(limited));
  });

  afterAll(async () => {
    await close(server);
  });

  it("returns JSON 429 once the budget is exhausted", async () => {
    expect((await fetch(`${baseUrl}/ping`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/ping`)).status).toBe(200);

    const limited = await fetch(`${baseUrl}/ping`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("content-type")).toMatch(/application\/json/);
    expect(await limited.json()).toEqual({
      error: "Too many requests. Please try again later.",
    });
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("Phase 4C — deployment configuration", () => {
  const renderYaml = readFileSync(resolve(repoRoot, "render.yaml"), "utf8");
  const serverEnvExample = readFileSync(
    resolve(repoRoot, "server/.env.example"),
    "utf8",
  );

  const renderKeys = [...renderYaml.matchAll(/^\s*- key: (\w+)/gm)].map(
    (m) => m[1],
  );
  const exampleKeys = [...serverEnvExample.matchAll(/^(\w+)=/gm)].map(
    (m) => m[1],
  );

  it("declares every server variable from .env.example in render.yaml", () => {
    // PORT is injected by Render itself.
    const expected = exampleKeys.filter((key) => key !== "PORT").sort();
    expect([...renderKeys].sort()).toEqual(
      expect.arrayContaining(expected),
    );
    for (const key of renderKeys) {
      if (key === "NODE_VERSION") continue;
      expect(exampleKeys).toContain(key);
    }
  });

  it("runs the API in production mode and probes the readiness route", () => {
    expect(renderYaml).toMatch(/- key: NODE_ENV\n\s+value: production/);
    expect(renderYaml).toMatch(/healthCheckPath: \/api\/ready/);
    expect(renderYaml).toMatch(/rootDir: server/);
    // devDependencies (TypeScript) must install despite NODE_ENV=production.
    expect(renderYaml).toMatch(/npm ci --include=dev/);
  });

  it("keeps secrets out of render.yaml", () => {
    for (const secret of [
      "MONGODB_URI",
      "CLERK_SECRET_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_ACCESS_KEY_ID",
    ]) {
      expect(renderYaml).toMatch(
        new RegExp(`- key: ${secret}\\n\\s+sync: false`),
      );
    }
  });

  it("rewrites client-side routes to index.html on Vercel", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(repoRoot, "vercel.json"), "utf8"),
    );
    expect(vercel.outputDirectory).toBe("dist");
    expect(vercel.rewrites).toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });
});

describe("Test-only Clerk stand-in never reaches the production build", () => {
  const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

  it("is wired only through vite.e2e.config.ts", () => {
    expect(read("vite.config.ts")).not.toMatch(/fake-clerk|e2e\/fullstack/);
    expect(read("vite.e2e.config.ts")).toMatch(/fake-clerk-react\.tsx/);
  });

  it("is not used by the production build commands", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.build).toBe("vite build");
    expect(JSON.parse(read("vercel.json")).buildCommand).toBe("npm run build");
    expect(read("render.yaml")).not.toMatch(/e2e/);
  });

  it("is not imported by application or server code", async () => {
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      "grep -rlE 'fake-clerk|e2e/fullstack' src server/src || true",
      { cwd: repoRoot, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((file) => !file.startsWith("src/test/"));
    expect(hits).toEqual([]);
  });
});
