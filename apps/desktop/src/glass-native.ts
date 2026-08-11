import { join } from "node:path";
import { createRequire } from "node:module";
import { BrowserWindow, ipcMain } from "electron";
import {
  BB_DESKTOP_SET_GLASS_REGIONS_CHANNEL,
  bbDesktopGlassRegionsSchema,
  type BbDesktopGlassRegions,
} from "./glass-contract.js";

interface NativeGlassModule {
  setRegions(handle: Buffer, regions: BbDesktopGlassRegions): void;
}

let nativeGlassModule: NativeGlassModule | null = null;

function getNativeGlassModule(): NativeGlassModule {
  if (nativeGlassModule !== null) {
    return nativeGlassModule;
  }
  const require = createRequire(__filename);
  nativeGlassModule = require(
    join(__dirname, "native", "bb-glass.node"),
  ) as NativeGlassModule;
  return nativeGlassModule;
}

export function registerNativeGlassIpc(
  releaseChannel = process.env.BB_DESKTOP_RELEASE_CHANNEL,
): void {
  if (releaseChannel !== "glass") {
    return;
  }
  ipcMain.on(BB_DESKTOP_SET_GLASS_REGIONS_CHANNEL, (event, value: unknown) => {
    const regions = bbDesktopGlassRegionsSchema.safeParse(value);
    if (!regions.success) {
      return;
    }
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow === null || browserWindow.isDestroyed()) {
      return;
    }
    getNativeGlassModule().setRegions(
      browserWindow.getNativeWindowHandle(),
      regions.data,
    );
  });
}
