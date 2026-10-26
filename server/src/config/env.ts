import { z } from "zod";

const DEFAULT_CLIENT_ORIGIN = "http://localhost:8080";
const optionalString = z
  .string()
  .trim()
  .transform((val) => (val === "" ? undefined : val))
  .optional();

function parseOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // CORS compares origins exactly, so reject paths, queries, and fragments
    // instead of silently stripping them.
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5001),
    // Reverse-proxy hops in front of the API (1 on Render). 0 trusts none.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    CLIENT_URL: optionalString,
    MONGODB_URI: z
      .string({ error: "MONGODB_URI is required." })
      .trim()
      .regex(/^mongodb(\+srv)?:\/\/.+/, {
        message: "MONGODB_URI must start with mongodb:// or mongodb+srv://.",
      }),
    CLERK_SECRET_KEY: z
      .string({ error: "CLERK_SECRET_KEY is required." })
      .trim()
      .regex(/^sk_(test|live)_.+/, {
        message: "CLERK_SECRET_KEY must start with sk_test_ or sk_live_.",
      }),
    CLERK_PUBLISHABLE_KEY: z
      .string({ error: "CLERK_PUBLISHABLE_KEY is required." })
      .trim()
      .regex(/^pk_(test|live)_.+/, {
        message: "CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_.",
      }),
    ADMIN_CLERK_USER_IDS: optionalString,
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    AWS_REGION: optionalString.pipe(
      z
        .string()
        .regex(/^[a-z]{2}(-[a-z]+)+-\d$/, {
          message: "AWS_REGION must look like us-east-1.",
        })
        .optional(),
    ),
    AWS_S3_BUCKET: optionalString,
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === "production";

    if (!env.CLIENT_URL) {
      if (isProduction) {
        ctx.addIssue({
          code: "custom",
          path: ["CLIENT_URL"],
          message:
            "CLIENT_URL is required in production (the deployed frontend origin).",
        });
      }
    } else {
      for (const raw of env.CLIENT_URL.split(",").map((o) => o.trim())) {
        if (!raw || !parseOrigin(raw)) {
          ctx.addIssue({
            code: "custom",
            path: ["CLIENT_URL"],
            message:
              "CLIENT_URL must be a comma-separated list of http(s) origins without paths (e.g. https://app.example.com).",
          });
          break;
        }
      }
    }

    const invalidAdminId = (env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .some((id) => !/^user_[A-Za-z0-9]+$/.test(id));
    if (invalidAdminId) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_CLERK_USER_IDS"],
        message:
          "ADMIN_CLERK_USER_IDS must be a comma-separated list of Clerk user IDs (user_...).",
      });
    }

    const hasAccessKey = Boolean(env.AWS_ACCESS_KEY_ID);
    const hasSecretKey = Boolean(env.AWS_SECRET_ACCESS_KEY);
    if (hasAccessKey !== hasSecretKey) {
      ctx.addIssue({
        code: "custom",
        path: [hasAccessKey ? "AWS_SECRET_ACCESS_KEY" : "AWS_ACCESS_KEY_ID"],
        message:
          "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together.",
      });
    }
    if (isProduction && hasAccessKey && hasSecretKey && !env.AWS_S3_BUCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["AWS_S3_BUCKET"],
        message:
          "AWS_S3_BUCKET is required in production when AWS credentials are set.",
      });
    }
  })
  .transform((env) => ({
    ...env,
    CLIENT_ORIGINS: env.CLIENT_URL
      ? env.CLIENT_URL.split(",").map((o) => parseOrigin(o.trim()) as string)
      : [DEFAULT_CLIENT_ORIGIN],
  }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `Invalid server environment configuration:\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}\nCheck server/.env (see server/.env.example).`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Validates server environment variables. Error messages name the offending
 * variables but never include their values, so they are safe to log.
 */
export function validateServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "environment";
      return issue.message.startsWith(name)
        ? issue.message
        : `${name}: ${issue.message}`;
    });
    throw new EnvValidationError([...new Set(issues)]);
  }

  return result.data;
}
