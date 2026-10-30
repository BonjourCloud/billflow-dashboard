/**
 * Registers the service worker (public/sw.js) so the app is installable.
 * Production builds only: in dev/tests a service worker would serve stale
 * files and get in the way of hot reload.
 */
export function registerServiceWorker(
  isProduction: boolean = import.meta.env.PROD,
  nav: Pick<Navigator, "serviceWorker"> | undefined = typeof navigator === "undefined" ? undefined : navigator,
  win: Pick<Window, "addEventListener"> | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!isProduction || !nav || !("serviceWorker" in nav) || !win) return false;
  win.addEventListener("load", () => {
    nav.serviceWorker.register("/sw.js").catch(() => {
      // Not fatal: the app works the same without it.
    });
  });
  return true;
}
