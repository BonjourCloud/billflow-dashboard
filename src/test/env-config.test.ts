import { describe, it, expect } from "vitest";
import {
  validateServerEnv,
  EnvValidationError,
} from "../../server/src/config/env";
import { resolveApiBaseUrl, DEV_API_BASE_URL } from "@/lib/apiBaseUrl";
import { resolveClerkPublishableKey } from "@/lib/clerkPublishableKey";

const validDevEnv = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.net/billflow",
  CLERK_SECRET_KEY: "sk_test_abc123",
  CLERK_PUBLISHABLE_KEY: "pk_test_abc123",
};

const validProdEnv = {
  ...validDevEnv,
  NODE_ENV: "production",
  CLIENT_URL: "https://app.example.com",
};

function issuesFor(env: Record<string, string>): string[] {
  try {
    validateServerEnv(env);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as EnvValidationError).issues;
  }
  throw new Error("Expected validateServerEnv to throw.");
}

describe("Phase 4A — Server environment validation", () => {
  it("accepts a minimal development environment and applies defaults", () => {
    const env = validateServerEnv(validDevEnv);
    expect(env.PORT).toBe(5001);
    expect(env.CLIENT_ORIGINS).toEqual(["http://localhost:8080"]);
  });

  it("reports every missing required variable at once", () => {
    const issues = issuesFor({ NODE_ENV: "development" });
    expect(issues.join("\n")).toMatch(/MONGODB_URI/);
    expect(issues.join("\n")).toMatch(/CLERK_SECRET_KEY/);
    expect(issues.join("\n")).toMatch(/CLERK_PUBLISHABLE_KEY/);
  });

  it("never includes secret values in error messages", () => {
    const secret = "sk_test_super_secret_value";
    try {
      validateServerEnv({
        ...validDevEnv,
        CLERK_SECRET_KEY: secret,
        MONGODB_URI: "postgres://user:hunter2@db",
      });
      throw new Error("Expected validateServerEnv to throw.");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/MONGODB_URI/);
      expect(message).not.toContain("hunter2");
      expect(message).not.toContain(secret);
    }
  });

  it("rejects malformed Clerk keys and Mongo URIs", () => {
    const issues = issuesFor({
      ...validDevEnv,
      MONGODB_URI: "localhost:27017",
      CLERK_SECRET_KEY: "s",
      CLERK_PUBLISHABLE_KEY: "",
    });
    expect(issues).toHaveLength(3);
  });

  it("requires CLIENT_URL in production", () => {
    const { CLIENT_URL: _omit, ...withoutClientUrl } = validProdEnv;
    expect(issuesFor(withoutClientUrl).join("\n")).toMatch(
      /CLIENT_URL is required in production/,
    );
    expect(validateServerEnv(validProdEnv).CLIENT_ORIGINS).toEqual([
      "https://app.example.com",
    ]);
  });

  it("normalizes a comma-separated origin list and strips trailing slashes", () => {
    const env = validateServerEnv({
      ...validProdEnv,
      CLIENT_URL: "https://app.example.com/, https://staging.example.com",
    });
    expect(env.CLIENT_ORIGINS).toEqual([
      "https://app.example.com",
      "https://staging.example.com",
    ]);
  });

  it("rejects CLIENT_URL values with paths or non-http protocols", () => {
    for (const CLIENT_URL of [
      "https://app.example.com/dashboard",
      "ftp://app.example.com",
      "app.example.com",
      "https://a.example.com,,https://b.example.com",
    ]) {
      expect(issuesFor({ ...validProdEnv, CLIENT_URL }).join("\n")).toMatch(
        /CLIENT_URL/,
      );
    }
  });

  it("defaults TRUST_PROXY to 0 and accepts a hop count", () => {
    expect(validateServerEnv(validDevEnv).TRUST_PROXY).toBe(0);
    expect(validateServerEnv({ ...validDevEnv, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(issuesFor({ ...validDevEnv, TRUST_PROXY: "yes" }).join("\n")).toMatch(
      /TRUST_PROXY/,
    );
    expect(issuesFor({ ...validDevEnv, TRUST_PROXY: "-1" }).join("\n")).toMatch(
      /TRUST_PROXY/,
    );
  });

  it("rejects invalid PORT and NODE_ENV values", () => {
    expect(issuesFor({ ...validDevEnv, PORT: "abc" }).join("\n")).toMatch(/PORT/);
    expect(issuesFor({ ...validDevEnv, PORT: "70000" }).join("\n")).toMatch(/PORT/);
    expect(issuesFor({ ...validDevEnv, NODE_ENV: "staging" }).join("\n")).toMatch(
      /NODE_ENV/,
    );
  });

  it("validates ADMIN_CLERK_USER_IDS entries as Clerk user IDs", () => {
    expect(
      validateServerEnv({
        ...validDevEnv,
        ADMIN_CLERK_USER_IDS: " user_abc123 , user_XYZ789, ",
      }),
    ).toBeTruthy();
    expect(
      issuesFor({ ...validDevEnv, ADMIN_CLERK_USER_IDS: "admin@example.com" }).join(
        "\n",
      ),
    ).toMatch(/ADMIN_CLERK_USER_IDS/);
  });

  it("requires AWS credentials to be set as a pair", () => {
    expect(
      issuesFor({ ...validDevEnv, AWS_ACCESS_KEY_ID: "AKIAEXAMPLE" }).join("\n"),
    ).toMatch(/AWS_SECRET_ACCESS_KEY/);
    expect(
      issuesFor({ ...validDevEnv, AWS_SECRET_ACCESS_KEY: "secret" }).join("\n"),
    ).toMatch(/AWS_ACCESS_KEY_ID/);
  });

  it("requires an explicit AWS_S3_BUCKET in production when credentials are set", () => {
    const withAws = {
      ...validProdEnv,
      AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "secret",
    };
    expect(issuesFor(withAws).join("\n")).toMatch(/AWS_S3_BUCKET/);
    expect(
      validateServerEnv({ ...withAws, AWS_S3_BUCKET: "billflow-assets" }),
    ).toBeTruthy();
  });

  it("treats empty optional values as unset and validates AWS_REGION", () => {
    expect(
      validateServerEnv({
        ...validDevEnv,
        AWS_ACCESS_KEY_ID: "",
        AWS_SECRET_ACCESS_KEY: "",
        AWS_REGION: "",
        ADMIN_CLERK_USER_IDS: "",
      }),
    ).toBeTruthy();
    expect(
      issuesFor({ ...validDevEnv, AWS_REGION: "US East" }).join("\n"),
    ).toMatch(/AWS_REGION/);
  });
});

describe("Phase 4A — Frontend API base URL resolution", () => {
  it("falls back to the local API only outside production", () => {
    expect(resolveApiBaseUrl(undefined, false)).toBe(DEV_API_BASE_URL);
    expect(resolveApiBaseUrl("   ", false)).toBe(DEV_API_BASE_URL);
  });

  it("throws in production when VITE_API_URL is missing", () => {
    expect(() => resolveApiBaseUrl(undefined, true)).toThrowError(
      /VITE_API_URL is required/,
    );
    expect(() => resolveApiBaseUrl("", true)).toThrowError(
      /VITE_API_URL is required/,
    );
  });

  it("strips trailing slashes from a configured URL", () => {
    expect(resolveApiBaseUrl("https://api.example.com/", true)).toBe(
      "https://api.example.com",
    );
  });

  it("requires https in production except for a local API", () => {
    for (const url of [
      "http://api.example.com",
      "http://billflow-api.onrender.com",
      "http://localhost.example.com",
      "http://10.0.0.5:5001",
    ]) {
      expect(() => resolveApiBaseUrl(url, true), url).toThrowError(/must use https/);
    }
    expect(resolveApiBaseUrl("https://billflow-api.onrender.com", true)).toBe(
      "https://billflow-api.onrender.com",
    );
    for (const url of [
      "http://localhost:5001",
      "http://127.0.0.1:5001",
      "http://[::1]:5001",
    ]) {
      expect(resolveApiBaseUrl(url, true)).toBe(url);
    }
  });

  it("allows http APIs outside production", () => {
    expect(resolveApiBaseUrl("http://api.example.com", false)).toBe(
      "http://api.example.com",
    );
  });

  it("rejects malformed URLs and unsupported protocols", () => {
    for (const url of ["https://", "http//api.example.com", "javascript:alert(1)", "ws://api.example.com"]) {
      expect(() => resolveApiBaseUrl(url, true), url).toThrowError(
        /absolute http\(s\) URL/,
      );
    }
  });

  it("rejects relative or non-http URLs", () => {
    expect(() => resolveApiBaseUrl("api.example.com", true)).toThrowError(
      /absolute http\(s\) URL/,
    );
    expect(() => resolveApiBaseUrl("ftp://api.example.com", false)).toThrowError(
      /absolute http\(s\) URL/,
    );
  });
});

describe("Phase 4E — Clerk publishable key validation", () => {
  it("accepts development and production publishable keys", () => {
    expect(resolveClerkPublishableKey(" pk_test_abc123 ")).toBe("pk_test_abc123");
    expect(resolveClerkPublishableKey("pk_live_abc123")).toBe("pk_live_abc123");
  });

  it("rejects missing keys", () => {
    expect(() => resolveClerkPublishableKey(undefined)).toThrowError(
      /Missing VITE_CLERK_PUBLISHABLE_KEY/,
    );
    expect(() => resolveClerkPublishableKey("  ")).toThrowError(
      /Missing VITE_CLERK_PUBLISHABLE_KEY/,
    );
  });

  it("rejects secret keys and malformed values", () => {
    for (const key of ["sk_test_abc123", "pk_abc", "publishable"]) {
      expect(() => resolveClerkPublishableKey(key)).toThrowError(
        /must start with pk_test_ or pk_live_/,
      );
    }
  });
});
