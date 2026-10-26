/**
 * Validates VITE_CLERK_PUBLISHABLE_KEY. Used at build time and at startup:
 * without a key the app cannot render, and Vite would otherwise tree-shake a
 * production bundle down to the error alone.
 */
export function resolveClerkPublishableKey(rawKey: string | undefined): string {
  const key = rawKey?.trim();

  if (!key) {
    throw new Error(
      "Missing VITE_CLERK_PUBLISHABLE_KEY. Check the project-root .env file.",
    );
  }

  if (!/^pk_(test|live)_.+/.test(key)) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_.",
    );
  }

  return key;
}
