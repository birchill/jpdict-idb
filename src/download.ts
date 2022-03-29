import { AbortError } from './abort-error';
import { DataSeries } from './data-series';
import { DataVersion } from './data-version';

// Produces an async interator of DownloadEvents

export type EntryEvent<EntryLine> = { type: 'entry' } & EntryLine;

export type DeletionEvent<DeletionLine> = { type: 'deletion' } & DeletionLine;

export interface VersionEvent {
  type: 'version';
  major: number;
  minor: number;
  patch: number;
  databaseVersion?: string;
  dateOfCreation: string;
}

export interface VersionEndEvent {
  type: 'versionend';
}

export interface ProgressEvent {
  type: 'progress';
  loaded: number;
  total: number;
}

export type DownloadEvent<EntryLine, DeletionLine> =
  | VersionEvent
  | VersionEndEvent
  | EntryEvent<EntryLine>
  | DeletionEvent<DeletionLine>
  | ProgressEvent;

const DEFAULT_BASE_URL = 'https://d907hooix2fo8.cloudfront.net/';

// How many percentage should change before we dispatch a new progress event.
const DEFAULT_MAX_PROGRESS_RESOLUTION = 0.05;

const FETCH_TIMEOUT_MS = 20 * 1000; // 20s

interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  databaseVersion: string;
  dateOfCreation: string;
}

export type DownloadOptions<EntryLine, DeletionLine> = {
  baseUrl?: string;
  series: DataSeries;
  majorVersion: number;
  currentVersion?: {
    major: number;
    minor: number;
    patch: number;
  };
  lang: string;
  signal: AbortSignal;
  maxProgressResolution?: number;
  forceFetch?: boolean;
  isEntryLine: (a: any) => a is EntryLine;
  isDeletionLine: (a: any) => a is DeletionLine;
};

export const enum DownloadErrorCode {
  VersionFileNotFound,
  VersionFileNotAccessible,
  VersionFileInvalid,
  MajorVersionNotFound,
  DatabaseFileNotFound,
  DatabaseFileNotAccessible,
  DatabaseFileHeaderMissing,
  DatabaseFileHeaderDuplicate,
  DatabaseFileVersionMismatch,
  DatabaseFileInvalidJSON,
  DatabaseFileInvalidRecord,
  DatabaseTooOld,
  Timeout,
}

interface DownloadErrorOptions {
  code: DownloadErrorCode;
  url?: string;
}

export class DownloadError extends Error {
  code: DownloadErrorCode;
  url?: string;

  constructor({ code, url }: DownloadErrorOptions, ...params: any[]) {
    super(...params);
    Object.setPrototypeOf(this, DownloadError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, DownloadError);
    }

    this.name = 'DownloadError';
    this.code = code;
    this.url = url;
  }
}

export async function hasLanguage({
  baseUrl = DEFAULT_BASE_URL,
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
    await getVersionInfo({
      baseUrl,
      series,
      majorVersion,
      lang,
      signal,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export async function* download<EntryLine, DeletionLine>({
  baseUrl = DEFAULT_BASE_URL,
  series,
  majorVersion,
  currentVersion,
  lang,
  signal,
  maxProgressResolution = DEFAULT_MAX_PROGRESS_RESOLUTION,
  forceFetch = false,
  isEntryLine,
  isDeletionLine,
}: DownloadOptions<EntryLine, DeletionLine>): AsyncIterableIterator<
  DownloadEvent<EntryLine, DeletionLine>
> {
  const versionInfo = await getVersionInfo({
    series,
    majorVersion,
    baseUrl,
    lang,
    signal,
    forceFetch,
  });

  // Check the local database is not ahead of what we're about to download
  //
  // This can happen when the version file gets cached because we can
  // download a more recent version (e.g. we have DevTools open with "skip
  // cache" ticked) and then try again to fetch the file but get the older
  // version.
  if (currentVersion && compareVersions(currentVersion, versionInfo) > 0) {
    const versionToString = ({ major, minor, patch }: Version) =>
      `${major}.${minor}.${patch}`;
    throw new DownloadError(
      { code: DownloadErrorCode.DatabaseTooOld },
      `Database version (${versionToString(
        versionInfo
      )}) older than current version (${versionToString(currentVersion)})`
    );
  }

  let nextPatch: number;
  if (
    !currentVersion ||
    // Check for a change in minor version
    compareVersions(currentVersion, { ...versionInfo, patch: 0 }) < 0
  ) {
    nextPatch = 0;
  } else {
    nextPatch = currentVersion.patch + 1;
  }

  while (nextPatch <= versionInfo.patch) {
    yield* getEvents({
      baseUrl,
      series,
      lang,
      maxProgressResolution,
      version: {
        major: versionInfo.major,
        minor: versionInfo.minor,
        patch: nextPatch,
      },
      signal,
      isEntryLine,
      isDeletionLine,
    });

    yield { type: 'versionend' };

    nextPatch++;
  }
}

type Version = {
  major: number;
  minor: number;
  patch: number;
};

function compareVersions(a: Version, b: Version): number {
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

let cachedVersionFile:
  | {
      contents: any;
      lang: string;
    }
  | undefined;

function waitWithTimeout<T>(promise: Promise<T>, url?: string): Promise<T> {
  let timeoutId: number;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = self.setTimeout(() => {
      clearTimeout(timeoutId);
      reject(
        new DownloadError(
          { code: DownloadErrorCode.Timeout, url },
          `Download timed out after ${FETCH_TIMEOUT_MS / 1000} seconds.`
        )
      );
    }, FETCH_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).then((val: T) => {
    clearTimeout(timeoutId);
    return val;
  });
}

async function getVersionInfo({
  baseUrl,
  majorVersion,
  series,
  lang,
  signal,
  forceFetch = false,
}: {
  baseUrl: string;
  majorVersion: number;
  series: string;
  lang: string;
  signal?: AbortSignal;
  forceFetch?: boolean;
}): Promise<VersionInfo> {
  let versionInfo;

  // Get the file if needed
  if (forceFetch || !cachedVersionFile || cachedVersionFile.lang !== lang) {
    const url = `${baseUrl}jpdict-rc-${lang}-version.json`;

    let response;
    try {
      response = await waitWithTimeout(fetch(url, { signal }), url);
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'DownloadError') {
        throw e;
      }

      throw new DownloadError(
        { code: DownloadErrorCode.VersionFileNotAccessible, url },
        `Version file ${url} not accessible (${e.message})`
      );
    }

    // Fetch rejects the promise for network errors, but not for HTTP errors :(
    if (!response.ok) {
      const code =
        response.status === 404
          ? DownloadErrorCode.VersionFileNotFound
          : DownloadErrorCode.VersionFileNotAccessible;
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
        { code: DownloadErrorCode.VersionFileInvalid, url },
        `Invalid version object: ${e.message}`
      );
    }
  } else {
    versionInfo = cachedVersionFile.contents;
  }

  // Inspect and extract the database version information
  const dbVersionInfo = getCurrentVersionInfo(
    versionInfo,
    series,
    majorVersion
  );
  if (!dbVersionInfo) {
    throw new DownloadError(
      { code: DownloadErrorCode.VersionFileInvalid },
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

function getCurrentVersionInfo(
  a: any,
  series: string,
  majorVersion: number
): VersionInfo | null {
  if (!a || typeof a !== 'object') {
    return null;
  }

  if (typeof a[series] !== 'object' || a[series] === null) {
    return null;
  }

  if (
    typeof a[series][majorVersion] !== 'object' ||
    a[series][majorVersion] === null
  ) {
    throw new DownloadError(
      { code: DownloadErrorCode.MajorVersionNotFound },
      `No ${majorVersion}.x version information for ${series} data`
    );
  }

  if (
    typeof a[series][majorVersion].major !== 'number' ||
    typeof a[series][majorVersion].minor !== 'number' ||
    typeof a[series][majorVersion].patch !== 'number' ||
    (typeof a[series][majorVersion].databaseVersion !== 'string' &&
      typeof a[series][majorVersion].databaseVersion !== 'undefined') ||
    typeof a[series][majorVersion].dateOfCreation !== 'string'
  ) {
    return null;
  }

  const versionInfo = a[series][majorVersion] as VersionInfo;

  if (
    versionInfo.major < 1 ||
    versionInfo.minor < 0 ||
    versionInfo.patch < 0 ||
    !versionInfo.dateOfCreation.length
  ) {
    return null;
  }

  return versionInfo;
}

type HeaderLine = {
  type: 'header';
  version: Omit<DataVersion, 'lang'>;
  records: number;
};

function isHeaderLine(a: any): a is HeaderLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.type === 'string' &&
    a.type === 'header' &&
    typeof a.version === 'object' &&
    typeof a.version.major === 'number' &&
    typeof a.version.minor === 'number' &&
    typeof a.version.patch === 'number' &&
    (typeof a.version.databaseVersion === 'string' ||
      typeof a.version.databaseVersion === 'undefined') &&
    typeof a.version.dateOfCreation === 'string' &&
    typeof a.records === 'number'
  );
}

async function* getEvents<EntryLine, DeletionLine>({
  baseUrl,
  series,
  lang,
  maxProgressResolution,
  version,
  signal,
  isEntryLine,
  isDeletionLine,
}: {
  baseUrl: string;
  series: DataSeries;
  lang: string;
  maxProgressResolution: number;
  version: Version;
  signal: AbortSignal;
  isEntryLine: (a: any) => a is EntryLine;
  isDeletionLine: (a: any) => a is DeletionLine;
}): AsyncIterableIterator<DownloadEvent<EntryLine, DeletionLine>> {
  const url = `${baseUrl}${series}-rc-${lang}-${version.major}.${version.minor}.${version.patch}.ljson`;

  // Fetch rejects the promise for network errors, but not for HTTP errors :(
  let response;
  try {
    response = await waitWithTimeout(fetch(url, { signal }), url);
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'DownloadError') {
      throw e;
    }

    throw new DownloadError(
      { code: DownloadErrorCode.DatabaseFileNotFound, url },
      `Database file ${url} not accessible (${e.message})`
    );
  }

  if (!response.ok) {
    const code =
      response.status === 404
        ? DownloadErrorCode.DatabaseFileNotFound
        : DownloadErrorCode.DatabaseFileNotAccessible;
    throw new DownloadError(
      { code, url },
      `Database file ${url} not accessible (status: ${response.status})`
    );
  }

  if (response.body === null) {
    throw new DownloadError(
      { code: DownloadErrorCode.DatabaseFileNotAccessible, url },
      'Body is null'
    );
  }

  let headerRead = false;
  let lastProgressPercent = 0;
  let recordsRead = 0;
  let totalRecords = 0;

  for await (const line of ljsonStreamIterator({
    stream: response.body,
    signal,
    url,
  })) {
    if (isHeaderLine(line)) {
      if (headerRead) {
        throw new DownloadError(
          { code: DownloadErrorCode.DatabaseFileHeaderDuplicate, url },
          `Got duplicate database header: ${JSON.stringify(line)}`
        );
      }

      if (compareVersions(line.version, version) !== 0) {
        throw new DownloadError(
          { code: DownloadErrorCode.DatabaseFileVersionMismatch, url },
          `Got mismatched database versions (Expected: ${JSON.stringify(
            version
          )} got: ${JSON.stringify(line.version)})`
        );
      }

      const versionEvent: VersionEvent = {
        ...line.version,
        type: 'version',
      };
      yield versionEvent;

      totalRecords = line.records;
      headerRead = true;
    } else {
      if (!headerRead) {
        throw new DownloadError(
          { code: DownloadErrorCode.DatabaseFileHeaderMissing, url },
          `Expected database version but got ${JSON.stringify(line)}`
        );
      }

      recordsRead++;

      if (isEntryLine(line)) {
        const entryEvent: EntryEvent<EntryLine> = {
          type: 'entry',
          ...line,
        };
        yield entryEvent;
      } else if (isDeletionLine(line)) {
        const deletionEvent: DeletionEvent<DeletionLine> = {
          type: 'deletion',
          ...line,
        };
        yield deletionEvent;
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
          { code: DownloadErrorCode.DatabaseFileInvalidRecord, url },
          `Got unexpected record: ${JSON.stringify(line)}`
        );
      }
    }

    // Dispatch a new ProgressEvent if we have passed the appropriate threshold
    if (
      totalRecords &&
      recordsRead / totalRecords - lastProgressPercent > maxProgressResolution
    ) {
      lastProgressPercent = recordsRead / totalRecords;
      yield { type: 'progress', loaded: recordsRead, total: totalRecords };
    }
  }
}

async function* ljsonStreamIterator({
  stream,
  signal,
  url,
}: {
  stream: ReadableStream<Uint8Array>;
  signal: AbortSignal;
  url: string;
}): AsyncIterableIterator<object> {
  const reader = stream.getReader();
  const lineEnd = /\n|\r|\r\n/m;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const parseLine = (line: string): any => {
    try {
      return JSON.parse(line);
    } catch (e) {
      try {
        reader.releaseLock();
      } catch (e) {
        /* Ignore */
      }
      throw new DownloadError(
        { code: DownloadErrorCode.DatabaseFileInvalidJSON, url },
        `Could not parse JSON in database file: ${line}`
      );
    }
  };

  while (true) {
    let readResult: ReadableStreamDefaultReadResult<Uint8Array>;
    try {
      readResult = await waitWithTimeout(reader.read(), url);
    } catch (e) {
      try {
        reader.releaseLock();
      } catch (e) {
        /* Ignore */
      }
      if (e.name === 'AbortError' || e.name === 'DownloadError') {
        throw e;
      }

      throw new DownloadError(
        { code: DownloadErrorCode.DatabaseFileNotAccessible, url },
        `Could not read database file (${e?.message ?? String(e)})`
      );
    }

    const { done, value } = readResult;

    if (done) {
      buffer += decoder.decode();
      if (buffer) {
        yield parseLine(buffer);
        buffer = '';
      }

      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(lineEnd);

    // We don't know if the last line is actually the last line of the
    // input or not until we get done: true so we just assume it is
    // a partial line for now.
    buffer = lines.length ? lines.splice(lines.length - 1, 1)[0] : '';

    for (const line of lines) {
      if (signal.aborted) {
        throw new AbortError();
      }

      if (!line) {
        continue;
      }

      yield parseLine(line);
    }
  }
}
