// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GLASS_APPEARANCE,
  GLASS_APPEARANCE_STORAGE_KEY,
  applyGlassAppearanceSettings,
  parseGlassAppearanceSettings,
  readGlassAppearanceSettings,
} from "./glass-appearance";

describe("glass appearance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  it("uses safe defaults for invalid stored values", () => {
    window.localStorage.setItem(GLASS_APPEARANCE_STORAGE_KEY, "not-json");
    expect(readGlassAppearanceSettings()).toEqual(DEFAULT_GLASS_APPEARANCE);
  });

  it("clamps opacity and blur values", () => {
    expect(
      parseGlassAppearanceSettings({
        mainOpacity: 130,
        mainBlur: 80,
        sidebarOpacity: -2,
        sidebarBlur: -8,
        panelOpacity: 40,
        panelBlur: 12,
      }),
    ).toEqual({
      mainOpacity: 100,
      mainBlur: 30,
      sidebarOpacity: 0,
      sidebarBlur: 0,
      panelOpacity: 40,
      panelBlur: 12,
    });
  });

  it("removes the CSS filter layer when blur is zero", () => {
    applyGlassAppearanceSettings(DEFAULT_GLASS_APPEARANCE);
    expect(
      document.documentElement.style.getPropertyValue(
        "--bb-glass-main-filter",
      ),
    ).toBe("none");

    applyGlassAppearanceSettings({
      ...DEFAULT_GLASS_APPEARANCE,
      mainBlur: 14,
    });
    expect(
      document.documentElement.style.getPropertyValue(
        "--bb-glass-main-filter",
      ),
    ).toBe("blur(14px)");
  });
});
