export type DesktopReleaseChannel = "latest" | "nightly" | "glass";

export interface DesktopReleaseInfo {
  applicationName: "bb" | "bb Nightly" | "bb Glass";
  channel: DesktopReleaseChannel;
  iconFileName: "icon.png" | "icon-nightly.png";
  releaseTag: "desktop-latest" | "desktop-nightly" | "desktop-glass";
  updateReleaseBaseUrl: string;
}

export function createDesktopReleaseInfo(
  channel: DesktopReleaseChannel,
): DesktopReleaseInfo {
  const applicationName =
    channel === "nightly" ? "bb Nightly" : channel === "glass" ? "bb Glass" : "bb";
  const releaseTag =
    channel === "nightly"
      ? "desktop-nightly"
      : channel === "glass"
        ? "desktop-glass"
        : "desktop-latest";

  return {
    applicationName,
    channel,
    iconFileName: channel === "nightly" ? "icon-nightly.png" : "icon.png",
    releaseTag,
    updateReleaseBaseUrl: `https://github.com/get-bb/bb/releases/download/${releaseTag}/`,
  };
}

function resolveBuiltDesktopReleaseChannel(
  rawChannel: string | undefined,
): DesktopReleaseChannel {
  if (rawChannel === undefined || rawChannel.length === 0) {
    return "latest";
  }
  if (
    rawChannel === "latest" ||
    rawChannel === "nightly" ||
    rawChannel === "glass"
  ) {
    return rawChannel;
  }

  throw new Error(
    `Built desktop release channel must be latest, nightly, or glass, got ${String(rawChannel)}.`,
  );
}

export const DESKTOP_RELEASE_CHANNEL = resolveBuiltDesktopReleaseChannel(
  process.env.BB_DESKTOP_RELEASE_CHANNEL,
);
export const DESKTOP_RELEASE_INFO = createDesktopReleaseInfo(
  DESKTOP_RELEASE_CHANNEL,
);
export const DESKTOP_UPDATE_RELEASE_BASE_URL =
  DESKTOP_RELEASE_INFO.updateReleaseBaseUrl;
export const DESKTOP_UPDATE_CHANNEL = DESKTOP_RELEASE_CHANNEL;
export const DESKTOP_UPDATE_FEED_URL = `${DESKTOP_UPDATE_RELEASE_BASE_URL}desktop-version.json`;

export interface DesktopAutoUpdateFeedConfig {
  channel: DesktopReleaseChannel;
  provider: "generic";
  url: string;
}

export const DESKTOP_AUTO_UPDATE_FEED_CONFIG: DesktopAutoUpdateFeedConfig = {
  channel: DESKTOP_UPDATE_CHANNEL,
  provider: "generic",
  url: DESKTOP_UPDATE_RELEASE_BASE_URL,
};
