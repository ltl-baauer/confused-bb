import { describe, expect, it } from "vitest";
import { createGlassWindowOptions } from "../src/glass-window-options.js";

describe("glass window options", () => {
  it("keeps standard builds opaque", () => {
    expect(createGlassWindowOptions("latest")).toEqual({});
  });

  it("uses native macOS vibrancy for glass builds", () => {
    expect(createGlassWindowOptions("glass")).toEqual({
      backgroundColor: "#00000000",
      vibrancy: "under-window",
      visualEffectState: "followWindow",
    });
  });
});
