import { describe, it, expect, beforeEach } from 'vitest';
import { initAnalytics, resetAnalyticsForTests, trackEvent } from '@/lib/analytics';

type W = Window & { dataLayer?: unknown[]; gtag?: unknown };

function freshWindow(doNotTrack?: string): Window {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const win = iframe.contentWindow as Window;
  if (doNotTrack) Object.defineProperty(win.navigator, 'doNotTrack', { value: doNotTrack, configurable: true });
  return win;
}

describe('Google Analytics loader', () => {
  beforeEach(() => {
    resetAnalyticsForTests();
  });

  it('loads nothing without a Measurement ID', () => {
    const win = freshWindow();
    expect(initAnalytics(undefined, win, win.document)).toBe(false);
    expect(initAnalytics('', win, win.document)).toBe(false);
    expect(win.document.head.querySelector('script')).toBeNull();
    expect((win as W).dataLayer).toBeUndefined();
  });

  it('rejects values that are not a GA4 Measurement ID', () => {
    const win = freshWindow();
    for (const bad of ['UA-12345-1', 'G-', 'g-abc12345', 'G-ABC"><script>', 'G-5BQ0TYTBD2/../x', 'https://evil.example']) {
      expect(initAnalytics(bad, win, win.document), bad).toBe(false);
    }
    expect(win.document.head.querySelector('script')).toBeNull();
  });

  it('loads gtag.js once and configures the property', () => {
    const win = freshWindow();
    expect(initAnalytics(' G-5BQ0TYTBD2 ', win, win.document)).toBe(true);
    expect(initAnalytics('G-5BQ0TYTBD2', win, win.document)).toBe(true);

    const scripts = win.document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-5BQ0TYTBD2');
    expect(scripts[0].async).toBe(true);

    const layer = (win as W).dataLayer as ArrayLike<unknown>[];
    expect(layer).toHaveLength(2);
    expect(layer[0][0]).toBe('js');
    expect(Array.from(layer[1])).toEqual(['config', 'G-5BQ0TYTBD2']);
  });

  it('respects Do Not Track', () => {
    const win = freshWindow('1');
    expect(initAnalytics('G-5BQ0TYTBD2', win, win.document)).toBe(false);
    expect(win.document.head.querySelector('script')).toBeNull();
  });

  it('sends events only when analytics is on', () => {
    expect(() => trackEvent('demo_started')).not.toThrow();
    const layerBefore = (window as W).dataLayer;
    expect(layerBefore).toBeUndefined();

    initAnalytics('G-5BQ0TYTBD2', window, document);
    trackEvent('demo_started', { source: 'landing' });
    const layer = (window as W).dataLayer as ArrayLike<unknown>[];
    expect(Array.from(layer[layer.length - 1])).toEqual(['event', 'demo_started', { source: 'landing' }]);
  });
});
