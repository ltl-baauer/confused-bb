import { z } from "zod";

export const BB_DESKTOP_SET_GLASS_REGIONS_CHANNEL =
  "bb:desktop:set-glass-regions";

export const bbDesktopGlassRegionsSchema = z.array(
  z
    .object({
      id: z.enum(["main", "panel", "sidebar"]),
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().nonnegative(),
      height: z.number().finite().nonnegative(),
      blur: z.number().finite().min(0).max(100),
    })
    .strict(),
);

export type BbDesktopGlassRegions = z.infer<typeof bbDesktopGlassRegionsSchema>;
