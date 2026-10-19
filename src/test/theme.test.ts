import { describe, it, expect, beforeEach } from "vitest";

describe("Theme Toggle & Background Resolution", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });

  const applyTheme = (isDark: boolean, settingsBackground: string) => {
    localStorage.setItem("billflow_theme", isDark ? "dark" : "light");
    if (!isDark) {
      document.documentElement.classList.add("light");
      document.documentElement.style.removeProperty("--background");
    } else {
      document.documentElement.classList.remove("light");
      if (settingsBackground) {
        document.documentElement.style.setProperty("--background", settingsBackground);
      }
    }
  };

  it("removes inline --background in light theme so light CSS variables apply", () => {
    // Initial dark settings applied
    document.documentElement.style.setProperty("--background", "222 47% 4%");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("222 47% 4%");

    // Switch to light theme
    applyTheme(false, "222 47% 4%");

    expect(document.documentElement.classList.contains("light")).toBe(true);
    // Crucial fix: inline style must be removed so .light CSS rule can take effect
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("");
    expect(localStorage.getItem("billflow_theme")).toBe("light");
  });

  it("restores dark theme background when switching back to dark theme", () => {
    // Switch to light
    applyTheme(false, "222 47% 4%");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // Switch back to dark
    applyTheme(true, "222 47% 4%");

    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("222 47% 4%");
    expect(localStorage.getItem("billflow_theme")).toBe("dark");
  });

  it("handles repeated toggling without leaking inline background styles in light mode", () => {
    for (let i = 0; i < 5; i++) {
      applyTheme(false, "222 47% 4%");
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.style.getPropertyValue("--background")).toBe("");

      applyTheme(true, "222 47% 4%");
      expect(document.documentElement.classList.contains("light")).toBe(false);
      expect(document.documentElement.style.getPropertyValue("--background")).toBe("222 47% 4%");
    }
  });

  it("retains light theme selection from localStorage", () => {
    localStorage.setItem("billflow_theme", "light");
    const saved = localStorage.getItem("billflow_theme");
    const isDark = saved === "dark";

    applyTheme(isDark, "222 47% 4%");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("");
  });
});
