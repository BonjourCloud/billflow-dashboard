import { vi } from "vitest";

// The server imports @clerk/express from server/node_modules. Keep the real
// getAuth (it reads req.auth, which the harness sets) and replace the Backend
// API client with the in-memory fake.
vi.mock(
  "../../../server/node_modules/@clerk/express/dist/index.mjs",
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { fakeClerkClient } = await import("./fakeClerk");
    return { ...actual, clerkClient: fakeClerkClient };
  },
);
