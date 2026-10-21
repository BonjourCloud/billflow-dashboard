
import { resolveApiBaseUrl } from "./apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL,
  import.meta.env.PROD,
);

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

export function configureApiAuth(provider: TokenProvider): void {
  tokenProvider = provider;
}

interface ApiOptions extends Omit<RequestInit, "headers"> {
  headers?: HeadersInit;
  authenticated?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { authenticated = true, headers: suppliedHeaders, ...requestOptions } =
    options;

  const headers = new Headers(suppliedHeaders);

  if (
  requestOptions.body &&
  !(requestOptions.body instanceof FormData) &&
  !headers.has("Content-Type")
  ) {
  headers.set("Content-Type", "application/json");
 }

  if (authenticated) {
    if (!tokenProvider) {
      throw new Error("API authentication has not been configured.");
    }

    const token = await tokenProvider();

    if (!token) {
      throw new Error("You must sign in before making this request.");
    }

    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error === "string") {
        message = parsed.error;
      }
    } catch {
      // Not JSON, keep raw text
    }

    throw new Error(
      message || `API request failed with status ${response.status}.`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
