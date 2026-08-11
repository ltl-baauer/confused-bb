export type DesktopReleaseChannel = "latest" | "nightly" | "glass";

export interface DesktopReleaseConfig {
  appId: "dev.bb.desktop" | "dev.bb.desktop.nightly" | "dev.bb.desktop.glass";
  applicationName: "bb" | "bb Nightly" | "bb Glass";
  artifactName: string;
  iconFileName: "icon.png" | "icon-nightly.png";
  macIconPath: "assets/icon.icns" | "assets/icon-nightly.icns";
  releaseTag: "desktop-latest" | "desktop-nightly" | "desktop-glass";
  updateMetadataFileName:
    | "latest-mac.yml"
    | "nightly-mac.yml"
    | "glass-mac.yml";
}

export const DESKTOP_RELEASE_CHANNEL_ENV_NAME: "BB_DESKTOP_RELEASE_CHANNEL";

export function resolveDesktopReleaseChannel(
  env: NodeJS.ProcessEnv,
): DesktopReleaseChannel;

export function createDesktopReleaseConfig(
  channel: DesktopReleaseChannel,
): DesktopReleaseConfig;

export function createDesktopUpdateReleaseBaseUrl(
  releaseTag: DesktopReleaseConfig["releaseTag"],
): string;
