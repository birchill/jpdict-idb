import * as s from 'superstruct';

import { AbortError } from './abort-error';
import { DownloadError } from './download-error';
import {
  getErrorMessage,
  isAbortError,
  isDownloadError,
} from './error-parsing';
import { fetchWithTimeout } from './fetch';
import { safeInteger } from './validation-helpers';

export type VersionInfo = s.Infer<typeof VersionInfoStruct>;

export async function getVersionInfo({
  baseUrl,
  series,
  lang,
  majorVersion,
  timeout,
  signal,
}: {
  baseUrl: string;
  series: string;
  lang: string;
  majorVersion: number;
  timeout: number;
  signal?: AbortSignal;
}): Promise<VersionInfo> {
  const versionInfoFile = await getVersionInfoFile({
    baseUrl,
    lang,
    timeout,
    signal,
  });

  // Extract the appropriate database version information
  const dbVersionInfo = getCurrentVersionInfo(
    versionInfoFile,
    series,
    majorVersion
  );
  if (!dbVersionInfo) {
    throw new DownloadError(
      { code: 'VersionFileInvalid' },
      `Invalid version object: the requested series, ${series} was not available in this language ('${lang}')`
    );
  }

  return dbVersionInfo;
}

export function clearCachedVersionInfo() {
  cachedVersionInfo = undefined;
}

const CACHE_TIMEOUT = 3_000 * 60; // Cache version file contents for 3 minutes

let cachedVersionInfo:
  | { lang: string; versionInfoFile: VersionInfoFile; accessTime: number }
  | undefined;

async function getVersionInfoFile({
  baseUrl,
  lang,
  timeout,
  signal,
}: {
  baseUrl: string;
  lang: string;
  timeout: number;
  signal?: AbortSignal;
}): Promise<VersionInfoFile> {
  if (
    cachedVersionInfo?.lang === lang &&
    cachedVersionInfo.accessTime > Date.now() - CACHE_TIMEOUT
  ) {
    return cachedVersionInfo.versionInfoFile;
  }
  cachedVersionInfo = undefined;
  const accessTime = Date.now();

  let rawVersionInfoFile;

  const url = `${baseUrl}jpdict/reader/version-${lang}.json`;

  let response;
  try {
    response = await fetchWithTimeout(url, { signal, timeout });
  } catch (e) {
    if (isAbortError(e) || isDownloadError(e)) {
      throw e;
    }

    throw new DownloadError(
      { code: 'VersionFileNotAccessible', url },
      `Version file ${url} not accessible (${getErrorMessage(e)})`
    );
  }

  // Fetch rejects the promise for network errors, but not for HTTP errors :(
  if (!response.ok) {
    const code =
      response.status === 404
        ? 'VersionFileNotFound'
        : 'VersionFileNotAccessible';
    throw new DownloadError(
      { code, url },
      `Version file ${url} not accessible (status: ${response.status})`
    );
  }

  // Try to parse it
  try {
    rawVersionInfoFile = await response.json();
  } catch (e) {
    throw new DownloadError(
      { code: 'VersionFileInvalid', url },
      `Invalid version object: ${
        getErrorMessage(e) || '(No detailed error message)'
      }`
    );
  }

  if (signal?.aborted) {
    throw new AbortError();
  }

  const versionInfoFile = parseVersionInfoFile(rawVersionInfoFile);

  cachedVersionInfo = { lang, versionInfoFile, accessTime };

  return versionInfoFile;
}

const VersionInfoStruct = s.type({
  major: s.min(safeInteger(), 1),
  minor: s.min(safeInteger(), 0),
  patch: s.min(safeInteger(), 0),
  parts: s.optional(s.min(safeInteger(), 1)),
  databaseVersion: s.optional(s.string()),
  dateOfCreation: s.nonempty(s.string()),
});

const VersionInfoFileStruct = s.record(
  s.string(),
  s.record(s.string(), VersionInfoStruct)
);

type VersionInfoFile = s.Infer<typeof VersionInfoFileStruct>;

function parseVersionInfoFile(rawVersionInfoFile: unknown): VersionInfoFile {
  if (!rawVersionInfoFile) {
    throw new DownloadError(
      { code: 'VersionFileInvalid' },
      'Empty version info file'
    );
  }

  const [error, versionInfoFile] = s.validate(
    rawVersionInfoFile,
    VersionInfoFileStruct
  );

  if (error) {
    throw new DownloadError(
      { code: 'VersionFileInvalid' },
      `Version file was invalid: ${error}`
    );
  }

  return versionInfoFile;
}

function getCurrentVersionInfo(
  versionInfoFile: VersionInfoFile,
  series: string,
  majorVersion: number
): VersionInfo | null {
  if (!(series in versionInfoFile)) {
    return null;
  }

  if (!(majorVersion in versionInfoFile[series])) {
    throw new DownloadError(
      { code: 'MajorVersionNotFound' },
      `No ${majorVersion}.x version information for ${series} data`
    );
  }

  return versionInfoFile[series][majorVersion];
}
