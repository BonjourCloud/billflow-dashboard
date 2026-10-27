import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForNewVersion } from '@/lib/chunkReload';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://www.billwill.site/assets/AdminCategories-x.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
    'Loading chunk 12 failed.',
  ])('recognises %j', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('reloadOnceForNewVersion', () => {
  beforeEach(() => sessionStorage.clear());

  it('reloads the first time', () => {
    const reload = vi.fn();
    expect(reloadOnceForNewVersion(1_000_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again within the cooldown (prevents a reload loop)', () => {
    const reload = vi.fn();
    reloadOnceForNewVersion(1_000_000, reload);
    expect(reloadOnceForNewVersion(1_030_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload after the cooldown', () => {
    const reload = vi.fn();
    reloadOnceForNewVersion(1_000_000, reload);
    expect(reloadOnceForNewVersion(1_100_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
