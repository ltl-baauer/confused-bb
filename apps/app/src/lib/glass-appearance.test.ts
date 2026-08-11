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

  it("clamps opacity values", () => {
    expect(
      parseGlassAppearanceSettings({
        mainOpacity: 130,
        sidebarOpacity: -2,
        panelOpacity: 40,
      }),
    ).toEqual({
      mainOpacity: 100,
      sidebarOpacity: 0,
      panelOpacity: 40,
    });
  });

  it("sets the almost-clear default tint", () => {
    applyGlassAppearanceSettings(DEFAULT_GLASS_APPEARANCE);
    expect(
      document.documentElement.style.getPropertyValue(
        "--bb-glass-main-opacity",
      ),
    ).toBe("2%");
  });
});
