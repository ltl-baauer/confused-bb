export const DESKTOP_RELEASE_CHANNEL_ENV_NAME = "BB_DESKTOP_RELEASE_CHANNEL";

export function resolveDesktopReleaseChannel(env) {
  const rawChannel = env[DESKTOP_RELEASE_CHANNEL_ENV_NAME]?.trim();
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
    `${DESKTOP_RELEASE_CHANNEL_ENV_NAME} must be latest, nightly, or glass, got ${rawChannel}.`,
  );
}

export function createDesktopReleaseConfig(channel) {
  if (channel === "glass") {
    return {
      appId: "dev.bb.desktop.glass",
      applicationName: "bb Glass",
      artifactName: "bb-glass-${version}-${arch}.${ext}",
      iconFileName: "icon.png",
      macIconPath: "assets/icon.icns",
      releaseTag: "desktop-glass",
      updateMetadataFileName: "glass-mac.yml",
    };
  }

  if (channel === "nightly") {
    return {
      appId: "dev.bb.desktop.nightly",
      applicationName: "bb Nightly",
      artifactName: "bb-nightly-${version}-${arch}.${ext}",
      iconFileName: "icon-nightly.png",
      macIconPath: "assets/icon-nightly.icns",
      releaseTag: "desktop-nightly",
      updateMetadataFileName: "nightly-mac.yml",
    };
  }

  return {
    appId: "dev.bb.desktop",
    applicationName: "bb",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    iconFileName: "icon.png",
    macIconPath: "assets/icon.icns",
    releaseTag: "desktop-latest",
    updateMetadataFileName: "latest-mac.yml",
  };
}

export function createDesktopUpdateReleaseBaseUrl(releaseTag) {
  return `https://github.com/get-bb/bb/releases/download/${releaseTag}/`;
}
