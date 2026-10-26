export const DEV_API_BASE_URL = "http://localhost:5001";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

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

  // A production page served over https cannot call an http API (mixed
  // content), so only allow http for a local API, e.g. `vite preview`.
  if (isProduction && url.protocol === "http:" && !LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      "VITE_API_URL must use https for production builds (http is allowed only for localhost).",
    );
  }

  // Request paths already start with "/api", so drop any trailing slash.
  return value.replace(/\/+$/, "");
}
