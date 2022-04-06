import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fetchMock from 'fetch-mock';
import { DownloadError } from './download-error';

import { download, DownloadEvent } from './download-v2';
import { isObject } from './is-object';

mocha.setup('bdd');
chai.use(chaiAsPromised);

const VERSION_1_0_0 = {
  kanji: {
    '1': {
      major: 1,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
};

const downloadKanjiV1 = () => {
  const abortController = new AbortController();
  return download({
    lang: 'en',
    forceFetch: true,
    majorVersion: 1,
    series: 'kanji',
    signal: abortController.signal,
  });
};

describe('download', () => {
  afterEach(() => fetchMock.restore());

  it('should download the initial version information', async () => {
    fetchMock.mock('end:version-en.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":0,"format":"full"}
`
    );

    const events = await drainEvents(downloadKanjiV1());

    assert.deepEqual(events, [
      { type: 'downloadstart', files: 1 },
      {
        type: 'filestart',
        major: 1,
        minor: 0,
        patch: 0,
        databaseVersion: '2019-173',
        dateOfCreation: '2019-06-22',
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should fail if there is no version file available', async () => {
    fetchMock.mock('end:version-en.json', 404);

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError, events] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'VersionFileNotFound');
      assert.match(downloadError.url || '', /version-en.json$/);
      assert.strictEqual(events.length, 0);
    }
  });

  it('should fail if the version file is corrupt', async () => {
    fetchMock.mock('end:version-en.json', 'yer');

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError, events] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'VersionFileInvalid');
      assert.strictEqual(events.length, 0);
    }
  });

  // TODO: should fail if the version file is missing required fields
  // TODO: should fail if the version file has invalid fields
  // TODO: should fail if the requested major version is not available
  // TODO: should fail if the first file is not available
  // TODO: should fail if the first file does not match
  // TODO: should download the first file
  // TODO: should fail if no header record appears
  // TODO: should fail if the version appears mid-stream
  // TODO: should fail if multiple header records appear
  // TODO: should fail if an entry is invalid (e.g. patch missing _ field)
  // TODO: should fetch all parts of an initial multi-part download
  // TODO: should fetch the single file for a non-multi-part download
  // TODO: should fetch all patches when updating a complete current version
  // TODO: should fail if one of the patches is missing
  // TODO: should fail if one of the patches is corrupt
  // TODO: should fail if one of the patches has a mismatched header
  // TODO: should report deletions
  // TODO: should report modifications
  // TODO: should resume a multi-part initial download
  // TODO: should NOT resume a multi-part initial download if there are more than 10 patches since
  // TODO: should fail when the latest version is less than the current version
  // TODO: should do nothing when the latest version equals the current version
  // TODO: should reset and fetch the latest version when there is a new minor version
  // TODO: should reset and fetch the latest version when there is a new major version we support
  // TODO: should request the appropriate language
  // TODO: should cancel any fetches if the download is canceled
  // TODO: should produce progress events
});

async function drainEvents(
  downloader: AsyncIterableIterator<DownloadEvent>,
  {
    includeProgressEvents = false,
    wrapError = false,
  }: { includeProgressEvents?: boolean; wrapError?: boolean } = {}
): Promise<Array<DownloadEvent>> {
  const events: Array<DownloadEvent> = [];

  try {
    for await (const event of downloader) {
      if (includeProgressEvents || event.type !== 'progress') {
        events.push(event);
      }
    }
  } catch (e) {
    if (wrapError) {
      throw new DrainError(e, events);
    } else {
      throw e;
    }
  }

  return events;
}

// If we get an error while draining, we should return the error along with all
// the events read up until that point.
class DrainError extends Error {
  error: unknown;
  events: Array<DownloadEvent>;

  constructor(error: unknown, events: Array<DownloadEvent>, ...params: any[]) {
    super(...params);
    Object.setPrototypeOf(this, DrainError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, DrainError);
    }

    this.name = 'DrainError';
    this.error = error;
    this.events = events;
  }
}

function parseDrainError(err: unknown): [DownloadError, Array<DownloadEvent>] {
  if (isObject(err) && err.name === 'AssertionError') {
    throw err;
  }
  assert.instanceOf(err, DrainError, 'Should be a DrainError');
  assert.instanceOf(
    (err as DrainError).error,
    DownloadError,
    'Should be a DownloadError'
  );
  return [
    (err as DrainError).error as DownloadError,
    (err as DrainError).events,
  ];
}
