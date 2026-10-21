import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";

// S3 itself is only exercised in staging. Here the client is replaced so the
// route's validation and the PutObject request it builds can be inspected.
const { s3State, sendMock } = vi.hoisted(() => ({
  s3State: { configured: true },
  sendMock: vi.fn(),
}));

vi.mock("../../../server/src/config/s3", () => ({
  isS3Configured: () => s3State.configured,
  getS3Client: () => ({ send: sendMock }),
  s3Bucket: "billflow-test-bucket",
  resetS3ClientForTesting: () => {},
}));

const ADMIN = "user_admin";
const REGULAR = "user_regular";

// Real 1x1 images.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

describe("Logo upload validation over HTTP", () => {
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
    registerClerkUser({ id: ADMIN, email: "admin@example.com" });
    registerClerkUser({ id: REGULAR, email: "regular@example.com" });
    s3State.configured = true;
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  function uploadLogo(
    bytes: Uint8Array,
    contentType: string,
    options: { user?: string; filename?: string } = {},
  ) {
    return harness.upload<{ url?: string; error?: string }>(
      "/api/admin/branding/logo",
      {
        user: options.user ?? ADMIN,
        field: "logo",
        filename: options.filename ?? "logo.bin",
        contentType,
        bytes,
      },
    );
  }

  it.each([
    ["image/png", PNG, "png"],
    ["image/jpeg", JPEG, "jpg"],
    ["image/webp", WEBP, "webp"],
  ])("stores a real %s using the detected type", async (type, bytes, extension) => {
    const res = await uploadLogo(bytes, type);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.url).toMatch(
      new RegExp(
        `^https://billflow-test-bucket\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com/branding/[0-9a-f-]{36}\\.${extension}$`,
      ),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    const input = sendMock.mock.calls[0][0].input;
    expect(input).toMatchObject({
      Bucket: "billflow-test-bucket",
      ContentType: type,
      CacheControl: "private, max-age=3600",
    });
    expect(input.Key).toMatch(new RegExp(`^branding/[0-9a-f-]{36}\\.${extension}$`));
    expect(Buffer.from(input.Body).equals(Buffer.from(bytes))).toBe(true);
  });

  it("rejects files whose bytes are not an image even with an image MIME type", async () => {
    for (const bytes of [
      Buffer.from("<html><script>alert(1)</script></html>"),
      Buffer.from("GIF89a\x01\x00\x01\x00"),
      PNG.subarray(0, 8), // signature only, truncated
      Buffer.alloc(0),
    ]) {
      const res = await uploadLogo(bytes, "image/png");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("File is not a valid PNG, JPEG, or WebP image.");
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects images whose declared type does not match their contents", async () => {
    for (const [bytes, declared] of [
      [PNG, "image/jpeg"],
      [JPEG, "image/webp"],
      [WEBP, "image/png"],
    ] as const) {
      const res = await uploadLogo(bytes, declared);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("File contents do not match its declared image type.");
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects disallowed MIME types before reading the file", async () => {
    const res = await uploadLogo(PNG, "image/svg+xml");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only PNG, JPEG, and WebP images are allowed.");
  });

  it("keeps the 2 MB limit", async () => {
    const oversized = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await uploadLogo(oversized, "image/png");
    expect(res.status).toBe(413);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 503 for a valid image when S3 is not configured", async () => {
    s3State.configured = false;
    const res = await uploadLogo(PNG, "image/png");
    expect(res.status).toBe(503);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("still requires an admin", async () => {
    expect((await uploadLogo(PNG, "image/png", { user: REGULAR })).status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
