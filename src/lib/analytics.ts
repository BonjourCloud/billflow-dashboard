/**
 * Google Analytics 4 (gtag.js), loaded only when a Measurement ID is configured.
 *
 * Set VITE_GA_MEASUREMENT_ID (for example in Vercel's Production environment)
 * to switch it on. Without it nothing is loaded, so development, tests and
 * preview deployments send no data. Enhanced measurement in the GA stream
 * counts page views on route changes, so no tracking calls are needed for those.
 *
 * Privacy: never pass amounts, bill names, e-mail addresses or user IDs as
 * event parameters. Visitors who send "Do Not Track" are not measured.
 */

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

type GtagArgs = unknown[];

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: GtagArgs) => void;
}

let enabled = false;

function doNotTrack(win: Window): boolean {
  const nav = win.navigator as Navigator & { msDoNotTrack?: string };
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1';
}

/** Loads gtag.js and starts measuring. Returns whether analytics is now active. */
export function initAnalytics(
  measurementId: string | undefined,
  win: Window = window,
  doc: Document = document,
): boolean {
  const id = measurementId?.trim();
  if (!id || !MEASUREMENT_ID_PATTERN.test(id) || doNotTrack(win)) return false;
  if (enabled) return true;

  const w = win as AnalyticsWindow;
  w.dataLayer = w.dataLayer ?? [];
  // gtag.js reads the `arguments` object itself, so a rest-parameter array would not work.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', id);

  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(script);

  enabled = true;
  return true;
}

/** Sends a custom event. Does nothing when analytics is off. */
export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}): void {
  if (!enabled) return;
  (window as AnalyticsWindow).gtag?.('event', name, params);
}

/** For tests only. */
export function resetAnalyticsForTests(): void {
  enabled = false;
}
