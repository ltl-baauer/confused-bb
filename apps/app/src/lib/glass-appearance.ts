import { useState } from "react";
import { getBbDesktopInfo, isGlassAppearanceAvailable } from "./bb-desktop";

export interface GlassAppearanceSettings {
  blurEnabled: boolean;
  mainOpacity: number;
  sidebarOpacity: number;
  panelOpacity: number;
}

export const DEFAULT_GLASS_APPEARANCE: GlassAppearanceSettings = {
  blurEnabled: false,
  mainOpacity: 0,
  sidebarOpacity: 0,
  panelOpacity: 0,
};

export const GLASS_APPEARANCE_STORAGE_KEY = "bb.glass-appearance.v3";

const OPACITY_KEYS = ["mainOpacity", "sidebarOpacity", "panelOpacity"] as const;

function clamp(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseGlassAppearanceSettings(
  value: unknown,
): GlassAppearanceSettings {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const settings = { ...DEFAULT_GLASS_APPEARANCE };

  for (const key of OPACITY_KEYS) {
    settings[key] = clamp(record[key], 0, 100);
  }
  if (typeof record.blurEnabled === "boolean") {
    settings.blurEnabled = record.blurEnabled;
  } else {
    // Old settings called zero tint 100% transparent. Preserve that promise.
    settings.blurEnabled = !OPACITY_KEYS.every((key) => settings[key] === 0);
  }
  return settings;
}

export function readGlassAppearanceSettings(): GlassAppearanceSettings {
  try {
    const rawValue = window.localStorage.getItem(GLASS_APPEARANCE_STORAGE_KEY);
    if (rawValue === null) {
      return { ...DEFAULT_GLASS_APPEARANCE };
    }
    return parseGlassAppearanceSettings(JSON.parse(rawValue));
  } catch {
    return { ...DEFAULT_GLASS_APPEARANCE };
  }
}

export function applyGlassAppearanceSettings(
  settings: GlassAppearanceSettings,
): void {
  const root = document.documentElement.style;
  root.setProperty("--bb-glass-main-opacity", `${settings.mainOpacity}%`);
  root.setProperty("--bb-glass-sidebar-opacity", `${settings.sidebarOpacity}%`);
  root.setProperty("--bb-glass-panel-opacity", `${settings.panelOpacity}%`);
  getBbDesktopInfo()?.setGlassBlur?.(settings.blurEnabled);
}

export function initializeGlassAppearance(): void {
  if (isGlassAppearanceAvailable()) {
    applyGlassAppearanceSettings(readGlassAppearanceSettings());
  }
}

export function useGlassAppearanceSettings(): readonly [
  GlassAppearanceSettings,
  (settings: GlassAppearanceSettings) => void,
] {
  const [settings, setSettingsState] = useState(readGlassAppearanceSettings);

  const setSettings = (nextSettings: GlassAppearanceSettings): void => {
    const parsedSettings = parseGlassAppearanceSettings(nextSettings);
    window.localStorage.setItem(
      GLASS_APPEARANCE_STORAGE_KEY,
      JSON.stringify(parsedSettings),
    );
    applyGlassAppearanceSettings(parsedSettings);
    setSettingsState(parsedSettings);
  };

  return [settings, setSettings] as const;
}
