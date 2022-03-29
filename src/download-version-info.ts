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

let cachedVersionFile:
  | {
      contents: any;
      lang: string;
    }
  | undefined;

export async function getVersionInfo({
  baseUrl,
  series,
  lang,
  majorVersion,
  timeout,
  signal,
  forceFetch = false,
}: {
  baseUrl: string;
  series: string;
  lang: string;
  majorVersion: number;
  timeout: number;
  signal?: AbortSignal;
  forceFetch?: boolean;
}): Promise<VersionInfo> {
  let versionInfo;

  // Get the file if needed
  if (forceFetch || cachedVersionFile?.lang !== lang) {
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
      versionInfo = await response.json();
    } catch (e) {
      throw new DownloadError(
        { code: 'VersionFileInvalid', url },
        `Invalid version object: ${
          getErrorMessage(e) || '(No detailed error message)'
        }`
      );
    }
  } else {
    versionInfo = cachedVersionFile.contents;
  }

  if (signal?.aborted) {
    throw new AbortError();
  }

  // Inspect and extract the database version information
  const dbVersionInfo = getCurrentVersionInfo(
    versionInfo,
    series,
    majorVersion
  );
  if (!dbVersionInfo) {
    throw new DownloadError(
      { code: 'VersionFileInvalid' },
      'Invalid version object: Did not match expected structure or requested series was not available in this language'
    );
  }

  // Cache the file contents
  cachedVersionFile = {
    contents: versionInfo,
    lang,
  };

  return dbVersionInfo;
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

function getCurrentVersionInfo(
  a: unknown,
  series: string,
  majorVersion: number
): VersionInfo | null {
  if (!a) {
    return null;
  }

  const [error, versionInfo] = s.validate(a, VersionInfoFileStruct);
  if (error) {
    throw new DownloadError(
      { code: 'VersionFileInvalid' },
      `Version file was invalid: ${error}`
    );
  }

  if (!(series in versionInfo)) {
    return null;
  }

  if (!(majorVersion in versionInfo[series])) {
    throw new DownloadError(
      { code: 'MajorVersionNotFound' },
      `No ${majorVersion}.x version information for ${series} data`
    );
  }

  return versionInfo[series][majorVersion];
}
