import * as s from 'superstruct';

import { DataSeries } from './data-series';
import { DataVersion } from './data-version';
import { DownloadError } from './download-error';
import { getVersionInfo } from './download-version-info';
import {
  getErrorMessage,
  isAbortError,
  isDownloadError,
} from './error-parsing';
import { fetchWithTimeout } from './fetch';
import { isObject } from './is-object';
import { ljsonStreamIterator } from './ljson-stream';
import { PartInfo } from './part-info';
import { stripFields } from './utils';
import { safeInteger } from './validation-helpers';
import { compareVersions, VersionNumber } from './version-number';

// Produces an async interator of DownloadEvents

//
// Event types
//

export type DownloadEvent =
  | ResetEvent
  | DownloadStartEvent
  | DownloadEndEvent
  | FileStartEvent
  | FileEndEvent
  | RecordEvent;

export type ResetEvent = { type: 'reset' };
export type DownloadStartEvent = { type: 'downloadstart'; files: number };
export type DownloadEndEvent = { type: 'downloadend' };
export type FileStartEvent = {
  type: 'filestart';
  version: DataVersion;
  totalRecords: number;
};
export type FileEndEvent = { type: 'fileend' };
export type RecordEvent = {
  type: 'record';
  mode: 'add' | 'change' | 'delete';
  record: Record<string, unknown>;
};

//
// Helper types
//

export type CurrentVersion = VersionNumber & {
  partInfo?: PartInfo;
};

//
// Configuration constants
//

const BASE_URL = 'https://data.10ten.life/';

const DOWNLOAD_TIMEOUT = 20_000;

export type DownloadOptions = {
  series: DataSeries;
  majorVersion: number;
  currentVersion?: CurrentVersion;
  lang: string;
  signal: AbortSignal;
};

export async function hasLanguage({
  series,
  majorVersion,
  lang,
  signal,
}: {
  baseUrl?: string;
  series: DataSeries;
  majorVersion: number;
  lang: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  try {
    const result = await getVersionInfo({
      baseUrl: BASE_URL,
      series,
      lang,
      majorVersion,
      timeout: DOWNLOAD_TIMEOUT,
      signal,
    });
    return !!result;
  } catch {
    return false;
  }
}

export async function* download({
  series,
  majorVersion,
  currentVersion,
  lang,
  signal,
}: DownloadOptions): AsyncIterableIterator<DownloadEvent> {
  const versionInfo = await getVersionInfo({
    baseUrl: BASE_URL,
    series,
    lang,
    majorVersion,
    timeout: DOWNLOAD_TIMEOUT,
    signal,
  });

  const { files, type } = getDownloadList({
    currentVersion,
    latestVersion: versionInfo,
  });

  if (type === 'reset' && currentVersion) {
    yield { type: 'reset' };
  }

  yield { type: 'downloadstart', files: files.length };

  for (const file of files) {
    yield* getEvents({
      baseUrl: BASE_URL,
      series,
      lang,
      version: file.version,
      signal,
      format: file.format,
      partInfo: file.partInfo,
    });
  }

  yield { type: 'downloadend' };
}

type DownloadFileSpec =
  | {
      format: 'full';
      version: VersionNumber;
      partInfo?: PartInfo;
    }
  | {
      format: 'patch';
      version: VersionNumber;
      partInfo?: never;
    };

function getDownloadList({
  currentVersion,
  latestVersion,
}: {
  currentVersion?: CurrentVersion;
  latestVersion: {
    major: number;
    minor: number;
    patch: number;
    parts?: number;
  };
}): {
  type: 'reset' | 'update';
  files: Array<DownloadFileSpec>;
} {
  // Check the local database is not ahead of what we're about to download
  //
  // This can happen when the version file gets cached because we can
  // download a more recent version (e.g. we have DevTools open with "skip
  // cache" ticked) and then try again to fetch the file but get the older
  // version.
  if (currentVersion && compareVersions(currentVersion, latestVersion) > 0) {
    const versionToString = ({ major, minor, patch }: VersionNumber) =>
      `${major}.${minor}.${patch}`;
    throw new DownloadError(
      { code: 'DatabaseTooOld' },
      `Database version (${versionToString(
        latestVersion
      )}) is older than the current version (${versionToString(
        currentVersion
      )})`
    );
  }

  // If there's no current version or if there's been a change in major/minor
  // version, reset any existing data.
  let downloadType =
    !currentVersion ||
    compareVersions(currentVersion, { ...latestVersion, patch: 0 }) < 0
      ? ('reset' as const)
      : ('update' as const);

  // Furthermore, if we're resuming a multi-part initial download but there have
  // since been more than 10 new patches to that minor version, we should just
  // start over.
  //
  // This will probably be faster and, more importantly, it means we can archive
  // the full (i.e. non-patch) version files of any minor version that is more
  // than 10 patches old without having to worry about really out-of-date
  // clients later requesting those parts.
  if (
    downloadType === 'update' &&
    currentVersion?.partInfo &&
    latestVersion.patch - currentVersion.patch > 10
  ) {
    downloadType = 'reset';
  }

  // There are four cases to consider:
  //
  // 1. We are doing a full download of a partitioned data series
  //    i.e. we need to download all the parts from 0 to `parts - 1`.
  //
  // 2. We are doing a full download of an unpartitioned data series
  //    i.e. we simply need to download the data file for the current patch
  //    level.
  //
  // 3. We are resuming a full download
  //    i.e. we need to download all the remaining parts _and_ the any
  //    subsequent patches.
  //
  // 4. We are patching an existing series
  //    i.e. we need to download each patch from the one after the current
  //    version up to and including the latest patch.

  // Case 1: Partitioned series
  if (downloadType === 'reset' && latestVersion.parts) {
    const files: Array<DownloadFileSpec> = [];
    let nextPart = 1;

    while (nextPart <= latestVersion.parts) {
      files.push({
        format: 'full',
        version: {
          major: latestVersion.major,
          minor: latestVersion.minor,
          patch: latestVersion.patch,
        },
        partInfo: {
          part: nextPart,
          parts: latestVersion.parts,
        },
      });
      nextPart++;
    }

    return { type: downloadType, files };
  }

  // Case 2: Unpartitioned series
  if (downloadType === 'reset') {
    return {
      type: downloadType,
      files: [
        {
          format: 'full',
          version: {
            major: latestVersion.major,
            minor: latestVersion.minor,
            patch: latestVersion.patch,
          },
        },
      ],
    };
  }

  // The following is just to help TypeScript realise that `currentVersion` must
  // be defined if `downloadType` is 'update'.
  if (!currentVersion) {
    throw new Error(
      'We should have already dealt with the initial download case'
    );
  }

  // Case 3 (part 1): Resumed partitioned series
  const files: Array<DownloadFileSpec> = [];
  if (currentVersion.partInfo) {
    let nextPart = currentVersion.partInfo.part + 1;

    while (nextPart <= currentVersion.partInfo.parts) {
      files.push({
        format: 'full',
        version: {
          major: currentVersion.major,
          minor: currentVersion.minor,
          patch: currentVersion.patch,
        },
        partInfo: {
          part: nextPart,
          parts: currentVersion.partInfo.parts,
        },
      });
      nextPart++;
    }
  }

  // Case 3 (part 2) and case 4: Updating a series
  let nextPatch = currentVersion.patch + 1;
  while (nextPatch <= latestVersion.patch) {
    files.push({
      format: 'patch',
      version: {
        major: latestVersion.major,
        minor: latestVersion.minor,
        patch: nextPatch,
      },
    });
    nextPatch++;
  }

  return { type: downloadType, files };
}

type GetEventsOptions = {
  baseUrl: string;
  series: DataSeries;
  lang: string;
  version: VersionNumber;
  signal: AbortSignal;
  format: 'full' | 'patch';
  partInfo?: PartInfo;
};

const HeaderLineStruct = s.type({
  type: s.literal('header'),
  version: s.type({
    major: s.min(safeInteger(), 1),
    minor: s.min(safeInteger(), 0),
    patch: s.min(safeInteger(), 0),
    databaseVersion: s.optional(s.string()),
    dateOfCreation: s.nonempty(s.string()),
  }),
  records: s.min(safeInteger(), 0),
  part: s.optional(s.min(safeInteger(), 0)),
  format: s.enums(['patch', 'full']),
});

const PatchLineStruct = s.type({
  _: s.enums(['+', '-', '~']),
});

async function* getEvents({
  baseUrl,
  series,
  lang,
  version,
  signal,
  format,
  partInfo,
}: GetEventsOptions): AsyncIterableIterator<DownloadEvent> {
  const dottedVersion = `${version.major}.${version.minor}.${version.patch}`;
  const commonUrlStart = `${baseUrl}jpdict/reader/${series}/${lang}/${dottedVersion}`;
  const url =
    format === 'patch'
      ? `${commonUrlStart}-patch.jsonl`
      : partInfo
        ? `${commonUrlStart}-${partInfo.part}.jsonl`
        : `${commonUrlStart}.jsonl`;

  let response;
  try {
    response = await fetchWithTimeout(url, {
      signal,
      timeout: DOWNLOAD_TIMEOUT,
    });
  } catch (e) {
    if (isAbortError(e) || isDownloadError(e)) {
      throw e;
    }

    throw new DownloadError(
      { code: 'DatabaseFileNotFound', url },
      `Database file ${url} not accessible (${getErrorMessage(e)})`
    );
  }

  if (!response.ok) {
    const code =
      response.status === 404
        ? 'DatabaseFileNotFound'
        : 'DatabaseFileNotAccessible';
    throw new DownloadError(
      { code, url },
      `Database file ${url} not accessible (status: ${response.status})`
    );
  }

  if (response.body === null) {
    throw new DownloadError(
      { code: 'DatabaseFileNotAccessible', url },
      'Body is null'
    );
  }

  let headerRead = false;

  for await (const line of ljsonStreamIterator({
    stream: response.body,
    signal,
    timeout: DOWNLOAD_TIMEOUT,
    url,
  })) {
    if (s.is(line, HeaderLineStruct)) {
      if (headerRead) {
        throw new DownloadError(
          { code: 'DatabaseFileHeaderDuplicate', url },
          `Got duplicate database header: ${JSON.stringify(line)}`
        );
      }

      if (compareVersions(line.version, version) !== 0) {
        throw new DownloadError(
          { code: 'DatabaseFileVersionMismatch', url },
          `Got mismatched database versions (Expected: ${JSON.stringify(
            version
          )} got: ${JSON.stringify(line.version)})`
        );
      }

      if (line.part !== partInfo?.part) {
        throw new DownloadError(
          { code: 'DatabaseFileVersionMismatch', url },
          `Got mismatched database part number (Expected: ${partInfo?.part}, got: ${line.part})`
        );
      }

      if (line.format !== format) {
        throw new DownloadError(
          { code: 'DatabaseFileVersionMismatch', url },
          `Expected to get a data file in ${format} format but got '${line.format}' format instead`
        );
      }

      let fileStartEvent: FileStartEvent;
      if (line.part !== undefined) {
        fileStartEvent = {
          type: 'filestart',
          totalRecords: line.records,
          version: {
            ...line.version,
            partInfo: {
              part: line.part,
              parts: partInfo!.parts,
            },
            lang,
          },
        };
      } else {
        fileStartEvent = {
          type: 'filestart',
          totalRecords: line.records,
          version: {
            ...line.version,
            lang,
          },
        };
      }

      yield fileStartEvent;

      headerRead = true;
    } else if (format === 'patch' && s.is(line, PatchLineStruct)) {
      if (!headerRead) {
        throw new DownloadError(
          { code: 'DatabaseFileHeaderMissing', url },
          `Expected database version but got ${JSON.stringify(line)}`
        );
      }

      const mode =
        line._ === '+' ? 'add' : line._ === '-' ? 'delete' : 'change';
      yield { type: 'record', mode, record: stripFields(line, ['_']) };
    } else if (format === 'full' && isObject(line)) {
      if (!headerRead) {
        throw new DownloadError(
          { code: 'DatabaseFileHeaderMissing', url },
          `Expected database version but got ${JSON.stringify(line)}`
        );
      }

      if ('_' in line) {
        throw new DownloadError(
          { code: 'DatabaseFileInvalidRecord', url },
          `Got patch-like '_' field in non-patch record: ${JSON.stringify(
            line
          )}`
        );
      }

      yield { type: 'record', mode: 'add', record: line };
    } else {
      // If we encounter anything unexpected we should fail.
      //
      // It might be tempting to make this "robust" by ignoring unrecognized
      // inputs but that could effectively leave us in an invalid state where
      // we claim to be update-to-date with database version X but are
      // actually missing some of the records.
      //
      // If anything unexpected shows up we should fail so we can debug
      // exactly what happenned.
      throw new DownloadError(
        { code: 'DatabaseFileInvalidRecord', url },
        `Got unexpected record: ${JSON.stringify(line)}`
      );
    }
  }

  yield { type: 'fileend' };
}
