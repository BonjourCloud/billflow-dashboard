import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isS3Configured,
  getS3Client,
  resetS3ClientForTesting,
} from "../../server/src/config/s3";
import {
  stopServer,
  setServerInstanceForTesting,
  resetShutdownStateForTesting,
  mongoose,
} from "../../server/src/index";

describe("S3 Configuration and Initialization Resilience", () => {
  const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

  afterEach(() => {
    resetS3ClientForTesting();
    if (originalAccessKey !== undefined) {
      process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
    } else {
      delete process.env.AWS_ACCESS_KEY_ID;
    }

    if (originalSecretKey !== undefined) {
      process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
    } else {
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it("returns false from isS3Configured() when credentials are missing", () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetS3ClientForTesting();

    expect(isS3Configured()).toBe(false);
  });

  it("returns false from isS3Configured() when only one credential is provided", () => {
    process.env.AWS_ACCESS_KEY_ID = "key-without-secret";
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetS3ClientForTesting();

    expect(isS3Configured()).toBe(false);
  });

  it("throws clear error when attempting to get S3Client without configured credentials", () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetS3ClientForTesting();

    expect(() => getS3Client()).toThrowError(
      /AWS S3 credentials.*are not configured/,
    );
  });

  it("returns true from isS3Configured() and returns S3Client when credentials are provided", () => {
    process.env.AWS_ACCESS_KEY_ID = "mock-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "mock-secret-key";
    resetS3ClientForTesting();

    expect(isS3Configured()).toBe(true);
    const client = getS3Client();
    expect(client).toBeDefined();
    expect(typeof client.send).toBe("function");
  });
});

describe("Graceful Shutdown Handler Resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setServerInstanceForTesting(null);
    resetShutdownStateForTesting();
  });

  it("executes shutdown sequence idempotently when server is idle", async () => {
    resetShutdownStateForTesting();
    setServerInstanceForTesting(null);

    // Calling stopServer should complete cleanly without errors
    await expect(stopServer()).resolves.toBeUndefined();

    // Calling stopServer a second time should exit early due to isShuttingDown guard
    await expect(stopServer()).resolves.toBeUndefined();
  });

  it("attempts MongoDB closure even if HTTP server closure fails with an error", async () => {
    resetShutdownStateForTesting();

    // Mock HTTP server that fails to close
    const mockServerError = new Error("Simulated HTTP server close failure");
    const mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => {
        cb(mockServerError);
        return mockServer;
      }),
    };

    setServerInstanceForTesting(
      mockServer as unknown as Parameters<typeof setServerInstanceForTesting>[0],
    );

    // Spy on mongoose.connection.close
    const mongooseCloseSpy = vi
      .spyOn(mongoose.connection, "close")
      .mockResolvedValue(undefined as unknown as typeof mongoose);

    // stopServer should reject with the server error, but crucially STILL close MongoDB
    await expect(stopServer()).rejects.toThrow("Simulated HTTP server close failure");

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mongooseCloseSpy).toHaveBeenCalledTimes(1);
    expect(mongooseCloseSpy).toHaveBeenCalledWith(false);
  });

  it("closes both HTTP server and MongoDB cleanly on normal shutdown", async () => {
    resetShutdownStateForTesting();

    const mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => {
        cb();
        return mockServer;
      }),
    };

    setServerInstanceForTesting(
      mockServer as unknown as Parameters<typeof setServerInstanceForTesting>[0],
    );

    const mongooseCloseSpy = vi
      .spyOn(mongoose.connection, "close")
      .mockResolvedValue(undefined as unknown as typeof mongoose);

    await expect(stopServer()).resolves.toBeUndefined();

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mongooseCloseSpy).toHaveBeenCalledTimes(1);
    expect(mongooseCloseSpy).toHaveBeenCalledWith(false);
  });
});
