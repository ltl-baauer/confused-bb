import { useState } from "react";
import { isGlassAppearanceAvailable } from "./bb-desktop";

export interface GlassAppearanceSettings {
  mainOpacity: number;
  mainBlur: number;
  sidebarOpacity: number;
  sidebarBlur: number;
  panelOpacity: number;
  panelBlur: number;
}

export const DEFAULT_GLASS_APPEARANCE: GlassAppearanceSettings = {
  mainOpacity: 22,
  mainBlur: 0,
  sidebarOpacity: 30,
  sidebarBlur: 0,
  panelOpacity: 30,
  panelBlur: 0,
};

export const GLASS_APPEARANCE_STORAGE_KEY = "bb.glass-appearance.v1";

const OPACITY_KEYS = [
  "mainOpacity",
  "sidebarOpacity",
  "panelOpacity",
] as const;
const BLUR_KEYS = ["mainBlur", "sidebarBlur", "panelBlur"] as const;

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
  for (const key of BLUR_KEYS) {
    settings[key] = clamp(record[key], 0, 30);
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

function blurFilter(value: number): string {
  return value === 0 ? "none" : `blur(${value}px)`;
}

export function applyGlassAppearanceSettings(
  settings: GlassAppearanceSettings,
): void {
  const root = document.documentElement.style;
  root.setProperty("--bb-glass-main-opacity", `${settings.mainOpacity}%`);
  root.setProperty("--bb-glass-main-filter", blurFilter(settings.mainBlur));
  root.setProperty(
    "--bb-glass-sidebar-opacity",
    `${settings.sidebarOpacity}%`,
  );
  root.setProperty(
    "--bb-glass-sidebar-filter",
    blurFilter(settings.sidebarBlur),
  );
  root.setProperty("--bb-glass-panel-opacity", `${settings.panelOpacity}%`);
  root.setProperty("--bb-glass-panel-filter", blurFilter(settings.panelBlur));
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
