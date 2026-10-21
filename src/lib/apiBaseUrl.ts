export const DEV_API_BASE_URL = "http://localhost:5001";

/**
 * Resolves the backend base URL from VITE_API_URL. Production builds must set
 * it explicitly; only development falls back to the local API server.
 */
export function resolveApiBaseUrl(
  rawUrl: string | undefined,
  isProduction: boolean,
): string {
  const value = rawUrl?.trim();

  if (!value) {
    if (isProduction) {
      throw new Error(
        "VITE_API_URL is required for production builds (e.g. https://api.example.com).",
      );
    }
    return DEV_API_BASE_URL;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be an absolute http(s) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_URL must be an absolute http(s) URL.");
  }

  // Request paths already start with "/api", so drop any trailing slash.
  return value.replace(/\/+$/, "");
}
