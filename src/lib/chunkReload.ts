/**
 * After a deploy, a tab that is still open can ask for a code-split chunk whose
 * filename no longer exists; the host answers with index.html and the dynamic
 * import fails. Reloading once picks up the new build.
 */

const RELOAD_KEY = 'billwill_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /expected a javascript.*module script/i,
  /unable to preload css/i,
  /loading chunk [\w-]+ failed/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Reloads the page unless it already did so within the cooldown, which stops a
 * reload loop if the chunk is genuinely missing. Returns true if a reload started.
 */
export function reloadOnceForNewVersion(
  now: number = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (last && now - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage unavailable: skip the loop guard rather than never recovering,
    // but only reload when we can't tell, which is at most once per page load.
  }
  reload();
  return true;
}

/** Vite fires this event when a lazy chunk (or its preloads) cannot be loaded. */
export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewVersion()) {
      event.preventDefault();
    }
  });
}
