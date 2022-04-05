export type VersionNumber = {
  major: number;
  minor: number;
  patch: number;
};

export function compareVersions(
  a: Readonly<VersionNumber>,
  b: Readonly<VersionNumber>
): number {
  if (a.major < b.major) {
    return -1;
  }
  if (a.major > b.major) {
    return 1;
  }
  if (a.minor < b.minor) {
    return -1;
  }
  if (a.minor > b.minor) {
    return 1;
  }
  if (a.patch < b.patch) {
    return -1;
  }
  if (a.patch > b.patch) {
    return 1;
  }
  return 0;
}
