import { describe, expect, it } from "vitest";
import { createGlassWindowOptions } from "../src/glass-window-options.js";

describe("glass window options", () => {
  it("keeps standard builds opaque", () => {
    expect(createGlassWindowOptions("latest")).toEqual({});
  });

  it("uses a clear window for native glass regions", () => {
    expect(createGlassWindowOptions("glass")).toEqual({
      backgroundColor: "#00000000",
    });
  });
});
