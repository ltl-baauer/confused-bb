import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Slider } from "@bb/shared-ui/slider";
import { isGlassAppearanceAvailable } from "@/lib/bb-desktop";
import {
  DEFAULT_GLASS_APPEARANCE,
  useGlassAppearanceSettings,
  type GlassAppearanceSettings,
} from "@/lib/glass-appearance";

type GlassRegion = "main" | "sidebar" | "panel";

const GLASS_REGIONS: ReadonlyArray<{
  label: string;
  region: GlassRegion;
}> = [
  { label: "Left sidebar", region: "sidebar" },
  { label: "Main content", region: "main" },
  { label: "Right panel", region: "panel" },
];

export function GlassAppearanceControls() {
  const [glassAvailable] = useState(isGlassAppearanceAvailable);
  const [settings, setSettings] = useGlassAppearanceSettings();

  if (!glassAvailable) {
    return null;
  }

  const updateValue = (
    region: GlassRegion,
    kind: "Opacity" | "Blur",
    value: number,
  ): void => {
    const key = `${region}${kind}` as keyof GlassAppearanceSettings;
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground">Glass</p>
          <p className="mt-0.5 text-xs text-subtle-foreground/75">
            Set the transparency and blur for each region.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSettings(DEFAULT_GLASS_APPEARANCE)}
        >
          Reset
        </Button>
      </div>
      {GLASS_REGIONS.map(({ label, region }) => {
        const opacityKey = `${region}Opacity` as keyof GlassAppearanceSettings;
        const blurKey = `${region}Blur` as keyof GlassAppearanceSettings;
        const opacity = settings[opacityKey];
        const blur = settings[blurKey];
        const transparency = 100 - opacity;

        return (
          <div
            key={region}
            className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3"
          >
            <p className="text-xs font-medium text-foreground">{label}</p>
            <label className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-xs text-muted-foreground">
              <span>Transparency</span>
              <Slider
                aria-label={`${label} transparency`}
                min={0}
                max={100}
                step={1}
                value={[transparency]}
                onValueChange={([value = transparency]) =>
                  updateValue(region, "Opacity", 100 - value)
                }
              />
              <span className="text-right tabular-nums">{transparency}%</span>
            </label>
            <label className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-xs text-muted-foreground">
              <span>Blur</span>
              <Slider
                aria-label={`${label} blur`}
                min={0}
                max={30}
                step={1}
                value={[blur]}
                onValueChange={([value = blur]) =>
                  updateValue(region, "Blur", value)
                }
              />
              <span className="text-right tabular-nums">{blur}px</span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
