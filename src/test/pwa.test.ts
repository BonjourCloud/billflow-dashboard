import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerServiceWorker } from "@/lib/pwa";

describe("registerServiceWorker", () => {
  it("does nothing outside production", () => {
    const win = { addEventListener: vi.fn() };
    expect(registerServiceWorker(false, { serviceWorker: { register: vi.fn() } } as never, win)).toBe(false);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("does nothing when the browser has no service worker support", () => {
    const win = { addEventListener: vi.fn() };
    expect(registerServiceWorker(true, {} as never, win)).toBe(false);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("registers /sw.js after load and swallows registration errors", async () => {
    const register = vi.fn().mockRejectedValue(new Error("blocked"));
    let onLoad: () => void = () => {};
    const win = { addEventListener: vi.fn((_: string, cb: () => void) => { onLoad = cb; }) };
    expect(registerServiceWorker(true, { serviceWorker: { register } } as never, win)).toBe(true);
    expect(win.addEventListener).toHaveBeenCalledWith("load", expect.any(Function));
    onLoad();
    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
});

describe("web app manifest", () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../public/manifest.webmanifest"), "utf8"));

  it("meets installability basics", () => {
    expect(manifest.name).toBe("BillWill");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/dashboard");
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });

  it("points every icon at a file that exists", () => {
    for (const icon of manifest.icons) {
      expect(() => readFileSync(resolve(__dirname, "../../public", icon.src.replace(/^\//, "")))).not.toThrow();
    }
  });
});
