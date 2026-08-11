import { describe, expect, it } from "vitest";
import { createGlassWindowOptions } from "../src/glass-window-options.js";

describe("glass window options", () => {
  it("keeps standard builds opaque", () => {
    expect(createGlassWindowOptions("latest")).toEqual({});
  });

  it("starts glass builds with a clear macOS window", () => {
    expect(createGlassWindowOptions("glass")).toEqual({
      backgroundColor: "#00000000",
      transparent: true,
    });
  });
});
