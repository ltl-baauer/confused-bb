import type { BrowserWindowConstructorOptions } from "electron";

export function createGlassWindowOptions(
  releaseChannel = process.env.BB_DESKTOP_RELEASE_CHANNEL,
): BrowserWindowConstructorOptions {
  if (releaseChannel !== "glass") {
    return {};
  }

  return {
    backgroundColor: "#00000000",
    transparent: true,
  };
}
