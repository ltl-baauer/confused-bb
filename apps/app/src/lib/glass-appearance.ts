import { useState } from "react";
import type { BbDesktopGlassRegion } from "@bb/desktop-contract";
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
  mainOpacity: 2,
  mainBlur: 8,
  sidebarOpacity: 4,
  sidebarBlur: 10,
  panelOpacity: 4,
  panelBlur: 10,
};

export const GLASS_APPEARANCE_STORAGE_KEY = "bb.glass-appearance.v2";

const OPACITY_KEYS = ["mainOpacity", "sidebarOpacity", "panelOpacity"] as const;
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
    settings[key] = clamp(record[key], 0, 100);
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

let currentSettings = { ...DEFAULT_GLASS_APPEARANCE };
let layoutFrame: number | null = null;

const GLASS_REGION_SELECTORS = {
  main: '[data-sidebar="inset"]',
  panel: "aside.bg-sidebar",
  sidebar: '[data-sidebar="panel"]',
} as const;

function readRegion(
  id: BbDesktopGlassRegion["id"],
  selector: string,
  blur: number,
): BbDesktopGlassRegion | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    return null;
  }
  const bounds = element.getBoundingClientRect();
  return {
    id,
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    blur,
  };
}

function sendNativeGlassLayout(): void {
  layoutFrame = null;
  const api = window.bbDesktop;
  if (api?.setGlassRegions === undefined) {
    return;
  }
  const regions = [
    readRegion(
      "sidebar",
      GLASS_REGION_SELECTORS.sidebar,
      currentSettings.sidebarBlur,
    ),
    readRegion("main", GLASS_REGION_SELECTORS.main, currentSettings.mainBlur),
    readRegion(
      "panel",
      GLASS_REGION_SELECTORS.panel,
      currentSettings.panelBlur,
    ),
  ].filter((region): region is BbDesktopGlassRegion => region !== null);
  api.setGlassRegions(regions);
}

function scheduleNativeGlassLayout(): void {
  if (window.bbDesktop?.setGlassRegions === undefined) {
    return;
  }
  if (layoutFrame === null) {
    layoutFrame = window.requestAnimationFrame(sendNativeGlassLayout);
  }
}

function observeNativeGlassLayout(): void {
  const resizeObserver = new ResizeObserver(scheduleNativeGlassLayout);
  let observedElements = new Set<Element>();

  const refreshObservedElements = (): void => {
    const nextElements = new Set(
      Object.values(GLASS_REGION_SELECTORS)
        .map((selector) => document.querySelector(selector))
        .filter((element): element is Element => element !== null),
    );
    const elementsChanged =
      nextElements.size !== observedElements.size ||
      [...nextElements].some((element) => !observedElements.has(element));
    if (!elementsChanged) {
      return;
    }
    resizeObserver.disconnect();
    for (const element of nextElements) {
      resizeObserver.observe(element);
    }
    observedElements = nextElements;
  };

  const mutationObserver = new MutationObserver(() => {
    refreshObservedElements();
    scheduleNativeGlassLayout();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleNativeGlassLayout);
  refreshObservedElements();
  scheduleNativeGlassLayout();
}

export function applyGlassAppearanceSettings(
  settings: GlassAppearanceSettings,
): void {
  currentSettings = settings;
  const root = document.documentElement.style;
  root.setProperty("--bb-glass-main-opacity", `${settings.mainOpacity}%`);
  root.setProperty("--bb-glass-sidebar-opacity", `${settings.sidebarOpacity}%`);
  root.setProperty("--bb-glass-panel-opacity", `${settings.panelOpacity}%`);
  scheduleNativeGlassLayout();
}

export function initializeGlassAppearance(): void {
  if (isGlassAppearanceAvailable()) {
    applyGlassAppearanceSettings(readGlassAppearanceSettings());
    observeNativeGlassLayout();
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
