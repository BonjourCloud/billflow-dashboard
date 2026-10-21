// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
// multer is a backend-only dependency; import the same copy the server uses so
// `instanceof multer.MulterError` checks match.
import multer from "../../server/node_modules/multer/index.js";
import {
  app,
  apiErrorHandler,
  UnsupportedFileTypeError,
} from "../../server/src/index";

// Derive Express types from the handler; express is a backend-only dependency.
type HandlerArgs = Parameters<typeof apiErrorHandler>;
type Request = HandlerArgs[1];
type Response = HandlerArgs[2];
type NextFunction = HandlerArgs[3];

function createMockRes(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

function runHandler(err: unknown, headersSent = false) {
  const res = createMockRes(headersSent);
  const next = vi.fn();
  apiErrorHandler(
    err,
    {} as Request,
    res as unknown as Response,
    next as unknown as NextFunction,
  );
  return { res, next };
}

describe("Phase 4A — apiErrorHandler", () => {
  it("maps oversized uploads to 413 JSON", () => {
    const { res } = runHandler(new multer.MulterError("LIMIT_FILE_SIZE", "logo"));
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "Logo image must be 2 MB or smaller." });
  });

  it("maps other multer errors to 400 JSON", () => {
    const { res } = runHandler(
      new multer.MulterError("LIMIT_UNEXPECTED_FILE", "avatar"),
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid file upload." });
  });

  it("maps rejected logo file types to 400 JSON", () => {
    const { res } = runHandler(new UnsupportedFileTypeError());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Only PNG, JPEG, and WebP images are allowed.",
    });
  });

  it("passes generic 4xx errors through without leaking their message", () => {
    const err = Object.assign(new Error("internal detail"), { status: 415 });
    const { res } = runHandler(err);
    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual({ error: "Invalid request." });
  });

  it("returns a generic 500 for unexpected errors without internals", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res } = runHandler(
      new Error("MongoServerError: connection string mongodb+srv://secret"),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error." });
    expect(JSON.stringify(res.body)).not.toContain("mongodb");
    consoleSpy.mockRestore();
  });

  it("delegates to Express when headers were already sent", () => {
    const err = new Error("late failure");
    const { res, next } = runHandler(err, true);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("Phase 4A — HTTP fallback and body parsing errors", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("still serves the health check", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ok");
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ error: "Route not found." });
  });

  it("returns a JSON 404 for unknown non-API paths", async () => {
    const response = await fetch(`${baseUrl}/index.html`, { method: "POST" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Route not found." });
  });

  it("returns JSON 400 for malformed JSON bodies instead of an HTML stack trace", async () => {
    const response = await fetch(`${baseUrl}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name": "Rent",',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Malformed JSON request body." });
    expect(text).not.toMatch(/at .*\.js/);
  });

  it("returns JSON 413 for bodies over the 100kb limit", async () => {
    const response = await fetch(`${baseUrl}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(150 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Request body is too large.",
    });
  });
});
