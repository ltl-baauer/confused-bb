import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Slider } from "@bb/shared-ui/slider";
import { Switch } from "@bb/shared-ui/switch";
import { isGlassAppearanceAvailable } from "@/lib/bb-desktop";
import {
  DEFAULT_GLASS_APPEARANCE,
  useGlassAppearanceSettings,
} from "@/lib/glass-appearance";

type GlassRegion = "main" | "sidebar" | "panel";
type GlassOpacityKey = `${GlassRegion}Opacity`;

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

  const updateValue = (region: GlassRegion, value: number): void => {
    const key = `${region}Opacity` as GlassOpacityKey;
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground">Glass</p>
          <p className="mt-0.5 text-xs text-subtle-foreground/75">
            Native blur affects the full window. Region controls set only the
            color tint.
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
      <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3">
        <div>
          <p className="text-xs font-medium text-foreground">Native blur</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Blur adds a macOS material tint. Turn it off for a fully clear
            window.
          </p>
        </div>
        <Switch
          aria-label="Native blur"
          checked={settings.blurEnabled}
          onCheckedChange={(blurEnabled) =>
            setSettings({ ...settings, blurEnabled })
          }
        />
      </div>
      {GLASS_REGIONS.map(({ label, region }) => {
        const opacityKey = `${region}Opacity` as GlassOpacityKey;
        const opacity = settings[opacityKey];

        return (
          <div
            key={region}
            className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3"
          >
            <p className="text-xs font-medium text-foreground">{label}</p>
            <label className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-xs text-muted-foreground">
              <span>Tint opacity</span>
              <Slider
                aria-label={`${label} tint opacity`}
                min={0}
                max={100}
                step={1}
                value={[opacity]}
                onValueChange={([value = opacity]) =>
                  updateValue(region, value)
                }
              />
              <span className="text-right tabular-nums">{opacity}%</span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
