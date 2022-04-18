import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiLike from 'chai-like';
import fetchMock from 'fetch-mock';
import { AbortError } from './abort-error';
import { DownloadError } from './download-error';

import { download, DownloadEvent, ProgressEvent } from './download-v2';
import { isObject } from './is-object';

mocha.setup('bdd');
chai.use(chaiLike);
chai.use(chaiAsPromised);

declare global {
  /* eslint @typescript-eslint/no-namespace: 0 */
  namespace Chai {
    interface Assert {
      likeEqual(expected: any, actual: any): void;
    }
  }
}

chai.assert.likeEqual = function (
  actual: any,
  expected: any,
  message?: string | undefined
) {
  const test = new chai.Assertion(actual, message, chai.assert, true);
  test.like(expected);
};

const KANJI_VERSION_1_0_0 = {
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

const WORDS_VERSION_1_1_2_PARTS_3 = {
  words: {
    '1': {
      major: 1,
      minor: 1,
      patch: 2,
      parts: 3,
      dateOfCreation: '2022-04-05',
    },
  },
};

const WORDS_VERSION_1_1_20_PARTS_3 = {
  words: {
    '1': {
      major: 1,
      minor: 1,
      patch: 20,
      parts: 3,
      dateOfCreation: '2022-04-05',
    },
  },
};

const downloadWordsV1 = () => {
  const abortController = new AbortController();
  return download({
    lang: 'en',
    forceFetch: true,
    majorVersion: 1,
    series: 'words',
    signal: abortController.signal,
  });
};

const downloadWordsV1From110 = () => {
  const abortController = new AbortController();
  return download({
    lang: 'en',
    forceFetch: true,
    majorVersion: 1,
    series: 'words',
    signal: abortController.signal,
    currentVersion: {
      major: 1,
      minor: 1,
      patch: 0,
    },
  });
};

describe('download', () => {
  afterEach(() => fetchMock.restore());

  it('should download the initial version information', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
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
        totalRecords: 0,
        version: {
          major: 1,
          minor: 0,
          patch: 0,
          databaseVersion: '2019-173',
          dateOfCreation: '2019-06-22',
          lang: 'en',
        },
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

  it('should fail if the version file is missing required fields', async () => {
    fetchMock.mock('end:version-en.json', {
      kanji: {
        '1': {
          major: 1,
          patch: 0,
          databaseVersion: '175',
          dateOfCreation: '2019-07-09',
        },
      },
    });

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError, events] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'VersionFileInvalid');
      assert.strictEqual(events.length, 0);
    }
  });

  it('should fail if the version file has invalid fields', async () => {
    fetchMock.mock('end:version-en.json', {
      kanji: { '1': { ...KANJI_VERSION_1_0_0.kanji['1'], major: 0 } },
    });

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError, events] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'VersionFileInvalid');
      assert.strictEqual(events.length, 0);
    }
  });

  it('should fail if the requested major version is not available', async () => {
    fetchMock.mock('end:version-en.json', {
      kanji: {
        '2': {
          ...KANJI_VERSION_1_0_0.kanji['1'],
          major: 2,
          minor: 0,
          patch: 1,
        },
      },
    });

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'MajorVersionNotFound');
    }
  });

  it('should fail if the first file is not available', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock('end:kanji/en/1.0.0.jsonl', 404);

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileNotFound');
    }
  });

  it('should fail if the first file does not match', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":1,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":0,"format":"full"}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileVersionMismatch');
    }
  });

  it('should fail if the format of the first file does not match', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":1,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":0,"format":"patch"}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileVersionMismatch');
    }
  });

  it('should fail if the part specification of the first file does not match', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":1,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":0,"format":"full"}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileVersionMismatch');
    }
  });

  it('should download the first file', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":2,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"㐆","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );

    const events = await drainEvents(downloadKanjiV1());

    assert.deepEqual(events, [
      { type: 'downloadstart', files: 1 },
      {
        type: 'filestart',
        totalRecords: 2,
        version: {
          major: 1,
          minor: 0,
          patch: 0,
          databaseVersion: '2019-173',
          dateOfCreation: '2019-06-22',
          lang: 'en',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          c: '㐂',
          m: [],
          misc: {
            sc: 6,
          },
          r: {},
          rad: {
            x: 1,
          },
          refs: {
            halpern_njecd: 2028,
            nelson_c: 265,
          },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          c: '㐆',
          m: [
            'to follow',
            'to trust to',
            'to put confidence in',
            'to depend on',
            'to turn around',
            'to turn the body',
          ],
          misc: {
            sc: 6,
          },
          r: {},
          rad: {
            x: 4,
          },
          refs: {},
        },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should fail if not header record appears', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"㐆","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileHeaderMissing');
    }
  });

  it('should fail if the header appears mid-stream', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
{"c":"㐆","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileHeaderMissing');
    }
  });

  it('should fail if multiple header records appear', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":2,"format":"full"}
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":2,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"㐆","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileHeaderDuplicate');
    }
  });

  it('should fail if a record in a full file has a patch type (_) field', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
{"_":"~","c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail if a line is not an object (string)', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
"I'm just stringing you along"
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail if a line is not an object (array)', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
[{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}]
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail if a line is not an object (invalid object)', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}
`
    );

    try {
      await drainEvents(downloadKanjiV1(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidJSON');
    }
  });

  it('should fetch all parts of an initial multi-part download', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.2-1.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":2,"part":1,"format":"full"}
{"id":1000000,"r":["ヽ"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"一の字点"}],"gt":1}]}
{"id":1000010,"r":["ヾ"],"s":[{"g":["voiced repetition mark in katakana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":2,"part":2,"format":"full"}
{"id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":1,"part":3,"format":"full"}
{"id":1000040,"k":["〃"],"r":["おなじ","おなじく"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
`
    );

    const events = await drainEvents(downloadWordsV1());

    assert.deepEqual(events, [
      {
        type: 'downloadstart',
        files: 3,
      },
      {
        type: 'filestart',
        totalRecords: 2,
        version: {
          major: 1,
          minor: 1,
          patch: 2,
          partInfo: {
            part: 1,
            parts: 3,
          },
          dateOfCreation: '2022-04-05',
          lang: 'en',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          id: 1000000,
          r: ['ヽ'],
          s: [
            {
              g: ['repetition mark in katakana'],
              pos: ['unc'],
              xref: [
                {
                  k: '一の字点',
                },
              ],
              gt: 1,
            },
          ],
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          id: 1000010,
          r: ['ヾ'],
          s: [
            {
              g: ['voiced repetition mark in katakana'],
              pos: ['unc'],
              gt: 1,
            },
          ],
        },
      },
      {
        type: 'fileend',
      },
      {
        type: 'filestart',
        totalRecords: 2,
        version: {
          major: 1,
          minor: 1,
          patch: 2,
          partInfo: {
            part: 2,
            parts: 3,
          },
          dateOfCreation: '2022-04-05',
          lang: 'en',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          id: 1000020,
          r: ['ゝ'],
          s: [
            {
              g: ['repetition mark in hiragana'],
              pos: ['unc'],
              gt: 1,
            },
          ],
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          id: 1000030,
          r: ['ゞ'],
          s: [
            {
              g: ['voiced repetition mark in hiragana'],
              pos: ['unc'],
              gt: 1,
            },
          ],
        },
      },
      {
        type: 'fileend',
      },
      {
        type: 'filestart',
        totalRecords: 1,
        version: {
          major: 1,
          minor: 1,
          patch: 2,
          partInfo: {
            part: 3,
            parts: 3,
          },
          dateOfCreation: '2022-04-05',
          lang: 'en',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: {
          id: 1000040,
          k: ['〃'],
          r: ['おなじ', 'おなじく'],
          s: [
            {
              g: ['ditto mark'],
              pos: ['n'],
            },
          ],
        },
      },
      {
        type: 'fileend',
      },
      {
        type: 'downloadend',
      },
    ]);
  });

  it('should fetch all patches when updating a complete current version', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":3,"format":"patch"}
{"_":"+","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"_":"~","id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"_":"-","id":1000050}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":1,"format":"patch"}
{"_":"+","id":1000040,"k":["〃"],"r":["おなじ","おなじく"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
`
    );

    const events = await drainEvents(downloadWordsV1From110());

    assert.likeEqual(events, [
      { type: 'downloadstart', files: 2 },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 1,
          dateOfCreation: '2022-04-05',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000020 },
      },
      {
        type: 'record',
        mode: 'change',
        record: { id: 1000030 },
      },
      {
        type: 'record',
        mode: 'delete',
        record: { id: 1000050 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 2,
          dateOfCreation: '2022-04-05',
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000040 },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should fail if a record in a patch file does NOT have a patch-type (_) field', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":2,"format":"patch"}
{"_":"+","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );

    try {
      await drainEvents(downloadWordsV1From110(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail in a record in a patch file has an unrecognized patch-type (_) field', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":2,"format":"patch"}
{"_":"+","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"_":"!","id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );

    try {
      await drainEvents(downloadWordsV1From110(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail if one of the patches is missing', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":1,"format":"patch"}
{"_":"+","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock('end:words/en/1.1.2-patch.jsonl', 404);

    try {
      await drainEvents(downloadWordsV1From110(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileNotFound');
    }
  });

  it('should fail if one of the patches is corrupt', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":1,"format":"patch"}
{"_":"!","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );

    try {
      await drainEvents(downloadWordsV1From110(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileInvalidRecord');
    }
  });

  it('should fail if one of the patches is corrupt', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":1,"format":"full"}
{"_":"!","id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );

    try {
      await drainEvents(downloadWordsV1From110(), { wrapError: true });
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseFileVersionMismatch');
    }
  });

  it('should resume a multi-part initial download including subsequent patches', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.0-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":0,"dateOfCreation":"2022-04-05"},"records":2,"part":2,"format":"full"}
{"id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.0-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":0,"dateOfCreation":"2022-04-05"},"records":2,"part":3,"format":"full"}
{"id":1000040,"k":["〃"],"r":["おなじ","おなじく"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
{"id":1000050,"k":["仝"],"r":["どうじょう"],"s":[{"g":["\\"as above\\" mark"],"pos":["n"]}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.1-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":1,"dateOfCreation":"2022-04-05"},"records":2,"format":"patch"}
{"_":"+","id":1000060,"k":["々"],"r":["のま","ノマ"],"rm":[0,{"app":0}],"s":[{"g":["kanji repetition mark"],"pos":["unc"],"xref":[{"k":"同の字点"}],"gt":1}]}
{"_":"+","id":1000090,"k":["○","〇"],"r":["まる"],"s":[{"g":["circle"],"pos":["n"],"xref":[{"k":"丸","r":"まる","sense":1}],"inf":"sometimes used for zero"},{"g":["\\"correct\\"","\\"good\\""],"pos":["n"],"xref":[{"k":"二重丸"}],"inf":"when marking a test, homework, etc."},{"g":["*","_"],"pos":["unc"],"xref":[{"k":"〇〇","sense":1}],"inf":"placeholder used to censor individual characters or indicate a space to be filled in"},{"g":["period","full stop"],"pos":["n"],"xref":[{"k":"句点"}]},{"g":["maru mark","semivoiced sound","p-sound"],"pos":["n"],"xref":[{"k":"半濁点"}]}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-patch.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":2,"format":"patch"}
{"_":"+","id":1000100,"k":["ＡＢＣ順"],"r":["エービーシーじゅん"],"s":[{"g":["alphabetical order"],"pos":["n"]}]}
{"_":"+","id":1000110,"k":["ＣＤプレーヤー","ＣＤプレイヤー"],"km":[{"p":["s1"]}],"r":["シーディープレーヤー","シーディープレイヤー"],"rm":[{"app":1,"p":["s1"]},{"app":2}],"s":[{"g":["CD player"],"pos":["n"]},{"g":["lecteur CD"],"lang":"fr"}]}
`
    );

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 1,
        series: 'words',
        signal: abortController.signal,
        currentVersion: {
          major: 1,
          minor: 1,
          patch: 0,
          partInfo: {
            part: 1,
            parts: 3,
          },
        },
      }),
      { wrapError: true }
    );

    assert.likeEqual(events, [
      { type: 'downloadstart', files: 4 },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 0,
          partInfo: { part: 2, parts: 3 },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000020 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000030 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 0,
          partInfo: { part: 3, parts: 3 },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000040 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000050 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 1,
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000060 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000090 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 2,
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000100 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000110 },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should NOT resume a multi-part initial download if there are more than 10 patches since', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_20_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.20-1.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":20,"dateOfCreation":"2022-04-05"},"records":2,"part":1,"format":"full"}
{"id":1000000,"r":["ヽ"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"一の字点"}],"gt":1}]}
{"id":1000010,"r":["ヾ"],"s":[{"g":["voiced repetition mark in katakana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.20-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":20,"dateOfCreation":"2022-04-05"},"records":2,"part":2,"format":"full"}
{"id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.20-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":20,"dateOfCreation":"2022-04-05"},"records":1,"part":3,"format":"full"}
{"id":1000040,"k":["〃"],"r":["おなじ","おなじく"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
`
    );

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 1,
        series: 'words',
        signal: abortController.signal,
        currentVersion: {
          major: 1,
          minor: 1,
          patch: 0,
          partInfo: {
            part: 1,
            parts: 3,
          },
        },
      })
    );

    assert.likeEqual(events, [
      { type: 'reset' },
      { type: 'downloadstart', files: 3 },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 20,
          partInfo: { part: 1, parts: 3 },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000000 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000010 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 20,
          partInfo: { part: 2, parts: 3 },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000020 },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000030 },
      },
      { type: 'fileend' },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 1,
          patch: 20,
          partInfo: { part: 3, parts: 3 },
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { id: 1000040 },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should fail when the latest version is less than the current version', async () => {
    // Set the latest version to 1.0.1
    fetchMock.mock('end:version-en.json', {
      kanji: { '1': { ...KANJI_VERSION_1_0_0.kanji['1'], patch: 1 } },
    });

    try {
      const abortController = new AbortController();
      // But fetch using a current version of 1.0.2
      await drainEvents(
        download({
          lang: 'en',
          forceFetch: true,
          majorVersion: 1,
          series: 'kanji',
          signal: abortController.signal,
          currentVersion: {
            major: 1,
            minor: 0,
            patch: 2,
          },
        }),
        { wrapError: true }
      );
      assert.fail('Should have thrown an exception');
    } catch (e) {
      const [downloadError] = parseDrainError(e);
      assert.strictEqual(downloadError.code, 'DatabaseTooOld');
    }
  });

  it('should do nothing when the latest version equals the current version', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 1,
        series: 'kanji',
        signal: abortController.signal,
        currentVersion: { major: 1, minor: 0, patch: 0 },
      })
    );

    assert.deepEqual(events, [
      { type: 'downloadstart', files: 0 },
      { type: 'downloadend' },
    ]);
  });

  it('should reset and fetch the latest version when there is a new minor version', async () => {
    fetchMock.mock('end:version-en.json', {
      kanji: { '1': { ...KANJI_VERSION_1_0_0.kanji['1'], minor: 2, patch: 3 } },
    });
    fetchMock.mock(
      'end:kanji/en/1.2.3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":2,"patch":3,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 1,
        series: 'kanji',
        signal: abortController.signal,
        currentVersion: { major: 1, minor: 0, patch: 0 },
      })
    );

    assert.likeEqual(events, [
      { type: 'reset' },
      { type: 'downloadstart', files: 1 },
      {
        type: 'filestart',
        version: {
          major: 1,
          minor: 2,
          patch: 3,
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { c: '㐂' },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should reset and fetch the latest version when there is a new major version we support', async () => {
    fetchMock.mock('end:version-en.json', {
      kanji: {
        '1': {
          major: 1,
          minor: 0,
          patch: 0,
          databaseVersion: '175',
          dateOfCreation: '2019-07-09',
        },
        '2': {
          major: 2,
          minor: 3,
          patch: 4,
          databaseVersion: '176',
          dateOfCreation: '2020-07-09',
        },
        '3': {
          major: 3,
          minor: 4,
          patch: 5,
          databaseVersion: '177',
          dateOfCreation: '2021-07-09',
        },
      },
    });
    fetchMock.mock(
      'end:kanji/en/2.3.4.jsonl',
      `
{"type":"header","version":{"major":2,"minor":3,"patch":4,"databaseVersion":"176","dateOfCreation":"2020-07-09"},"records":1,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 2,
        series: 'kanji',
        signal: abortController.signal,
        currentVersion: { major: 1, minor: 0, patch: 0 },
      })
    );

    assert.likeEqual(events, [
      { type: 'reset' },
      { type: 'downloadstart', files: 1 },
      {
        type: 'filestart',
        version: {
          major: 2,
          minor: 3,
          patch: 4,
        },
      },
      {
        type: 'record',
        mode: 'add',
        record: { c: '㐂' },
      },
      { type: 'fileend' },
      { type: 'downloadend' },
    ]);
  });

  it('should request the appropriate language', async () => {
    fetchMock.mock('end:version-fr.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/fr/1.0.0.jsonl',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"176","dateOfCreation":"2020-07-09"},"records":1,"format":"full"}
`
    );

    const abortController = new AbortController();
    await drainEvents(
      download({
        lang: 'fr',
        forceFetch: true,
        majorVersion: 1,
        series: 'kanji',
        signal: abortController.signal,
      })
    );

    assert.isFalse(
      fetchMock.called('end:version-en.json'),
      'Should NOT get en version'
    );
    assert.isTrue(
      fetchMock.called('end:version-fr.json'),
      'Should get fr version'
    );
    assert.isFalse(
      fetchMock.called('end:kanji/en/1.0.0.jsonl'),
      'Should NOT get en database file'
    );
    assert.isTrue(
      fetchMock.called('end:kanji/fr/1.0.0.jsonl'),
      'Should get fr database file'
    );
  });

  it('should cancel any fetches if the download is canceled', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":2,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"㐆","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}`
    );

    const abortController = new AbortController();
    const downloader = download({
      lang: 'en',
      forceFetch: true,
      majorVersion: 1,
      series: 'kanji',
      signal: abortController.signal,
    });

    // Read version event
    const readResult = await downloader.next();
    assert.isFalse(readResult.done, 'Iterator should not have finished yet');

    abortController.abort();

    await assert.isRejected(downloader.next(), AbortError);
  });

  it('should produce progress events', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.2-1.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":26,"part":1,"format":"full"}
{"id":1000000,"r":["ヽ"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"一の字点"}],"gt":1}]}
{"id":1000010,"r":["ヾ"],"s":[{"g":["voiced repetition mark in katakana"],"pos":["unc"],"gt":1}]}
{"id":1000020,"r":["ゝ"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["ゞ"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000040,"k":["〃"],"r":["おなじ","おなじく"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
{"id":1000050,"k":["仝"],"r":["どうじょう"],"s":[{"g":["\\"as above\\" mark"],"pos":["n"]}]}
{"id":1000060,"k":["々"],"r":["のま","ノマ"],"rm":[0,{"app":0}],"s":[{"g":["kanji repetition mark"],"pos":["unc"],"xref":[{"k":"同の字点"}],"gt":1}]}
{"id":1000090,"k":["○","〇"],"r":["まる"],"s":[{"g":["circle"],"pos":["n"],"xref":[{"k":"丸","r":"まる","sense":1}],"inf":"sometimes used for zero"},{"g":["\\"correct\\"","\\"good\\""],"pos":["n"],"xref":[{"k":"二重丸"}],"inf":"when marking a test, homework, etc."},{"g":["*","_"],"pos":["unc"],"xref":[{"k":"〇〇","sense":1}],"inf":"placeholder used to censor individual characters or indicate a space to be filled in"},{"g":["period","full stop"],"pos":["n"],"xref":[{"k":"句点"}]},{"g":["maru mark","semivoiced sound","p-sound"],"pos":["n"],"xref":[{"k":"半濁点"}]}]}
{"id":1000100,"k":["ＡＢＣ順"],"r":["エービーシーじゅん"],"s":[{"g":["alphabetical order"],"pos":["n"]}]}
{"id":1000110,"k":["ＣＤプレーヤー","ＣＤプレイヤー"],"km":[{"p":["s1"]}],"r":["シーディープレーヤー","シーディープレイヤー"],"rm":[{"app":1,"p":["s1"]},{"app":2}],"s":[{"g":["CD player"],"pos":["n"]}]}
{"id":1000130,"k":["Ｎ響"],"r":["エヌきょう"],"s":[{"g":["NHK Symphony Orchestra"],"pos":["n"],"misc":["abbr"]}]}
{"id":1000140,"k":["Ｏバック"],"r":["オーバック"],"s":[{"g":["O-back","skirt with peek-a-boo hole in rump"],"pos":["n"]}]}
{"id":1000150,"k":["ＲＳ２３２ケーブル"],"r":["アールエスにさんにケーブル"],"s":[{"g":["rs232 cable"],"pos":["n"]}]}
{"id":1000160,"k":["Ｔシャツ"],"km":[{"p":["s1"]}],"r":["ティーシャツ"],"rm":[{"p":["s1"],"a":0}],"s":[{"g":["T-shirt","tee shirt"],"pos":["n"]}]}
{"id":1000170,"k":["Ｔバック"],"km":[{"p":["s1"]}],"r":["ティーバック"],"rm":[{"p":["s1"]}],"s":[{"g":["T-back","bikini thong"],"pos":["n"]}]}
{"id":1000200,"k":["あうんの呼吸","阿吽の呼吸","あ・うんの呼吸"],"r":["あうんのこきゅう"],"rm":[{"a":0}],"s":[{"g":["the harmonizing, mentally and physically, of two parties engaged in an activity","singing from the same hymn-sheet","dancing to the same beat"],"pos":["exp","n"],"misc":["id"]}]}
{"id":1000210,"r":["あおば"],"s":[{"g":["(former) regular (stops at every station) Tōhoku-line Shinkansen"],"pos":["n"],"xref":[{"r":"やまびこ"}],"misc":["obs"]}]}
{"id":1000220,"k":["明白"],"km":[{"p":["i1","n1","nf10"]}],"r":["めいはく"],"rm":[{"p":["i1","n1","nf10"],"a":0}],"s":[{"g":["obvious","clear","plain","evident","apparent","explicit","overt"],"pos":["adj-na"]}]}
{"id":1000225,"k":["明白","偸閑","白地"],"km":[{"i":["ateji"]},{"i":["ateji"]},{"i":["ateji"]}],"r":["あからさま"],"rm":[{"a":[{"i":0},{"i":3}]}],"s":[{"g":["plain","frank","candid","open","direct","straightforward","unabashed","blatant","flagrant"],"pos":["adj-na","adj-no"],"misc":["uk"]}]}
{"id":1000230,"k":["明かん"],"r":["あかん","アカン"],"rm":[0,{"app":0}],"s":[{"g":["useless","no good","hopeless"],"pos":["exp"],"misc":["uk"],"inf":"commonly used with adj-i inflections, e.g. あかんかった, あかんくない, etc.","dial":["ks"]}]}
{"id":1000260,"k":["悪どい"],"r":["あくどい"],"s":[{"g":["gaudy","showy","garish","loud"],"pos":["adj-i"],"xref":[{"k":"あくが強い","r":"あくがつよい","sense":2}],"misc":["uk"],"inf":"あく from 灰汁"},{"g":["crooked","vicious","wicked","nasty","unscrupulous","dishonest"],"pos":["adj-i"],"misc":["uk"]}]}
{"id":1000280,"k":["論う"],"r":["あげつらう"],"rm":[{"a":4}],"s":[{"g":["to discuss"],"pos":["v5u","vt"],"misc":["uk"]},{"g":["to find fault with","to criticize","to criticise"],"pos":["v5u","vt"]}]}
{"id":1000290,"r":["あさひ"],"s":[{"g":["Jouetsu line express Shinkansen"],"pos":["n"]}]}
{"id":1000300,"k":["遇う","配う"],"r":["あしらう"],"s":[{"g":["to treat","to handle","to deal with"],"kapp":1,"pos":["v5u","vt"],"misc":["uk"]},{"g":["to arrange","to decorate","to dress","to garnish"],"pos":["v5u","vt"],"misc":["uk"]}]}
{"id":1000310,"k":["馬酔木"],"r":["あせび","あしび","あせぼ","あせぶ","アセビ"],"rm":[{"a":0},{"a":0},{"a":0},0,{"app":0,"a":0}],"s":[{"g":["Japanese andromeda (Pieris japonica)","lily-of-the-valley"],"pos":["n"],"misc":["uk"]}]}
{"id":1000320,"k":["彼処","彼所"],"km":[{"i":["rK"]},{"i":["rK"]}],"r":["あそこ","あすこ","かしこ","アソコ","あしこ","あこ"],"rm":[{"p":["i1"],"a":0},{"a":0},{"a":1},{"app":0,"a":0},{"i":["ok"]},{"i":["ok"],"a":1}],"s":[{"g":["there","over there","that place","yonder","you-know-where"],"pos":["pn"],"xref":[{"r":"どこ","sense":1},{"r":"ここ","sense":1},{"r":"そこ","sense":1}],"misc":["uk"],"inf":"place physically distant from both speaker and listener"},{"g":["genitals","private parts","nether regions"],"rapp":11,"pos":["n"],"misc":["col","uk"]},{"g":["that far","that much","that point"],"pos":["n"],"xref":[{"r":"あれほど"}],"misc":["uk"],"inf":"something psychologically distant from both speaker and listener"}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":58,"part":2,"format":"full"}
{"id":1000360,"r":["あっさり","アッサリ"],"rm":[{"p":["i1"],"a":3},{"a":3}],"s":[{"g":["easily","readily","quickly","flatly (refuse)"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]},{"g":["lightly (seasoned food, applied make-up, etc.)","plainly","simply"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000390,"k":["あっという間に","あっと言う間に","あっとゆう間に","アッという間に","アッと言う間に","アッとゆう間に"],"km":[{"p":["s1"]}],"r":["あっというまに","あっとゆうまに","アッというまに","アッとゆうまに"],"rm":[{"app":3,"p":["s1"]},{"app":6,"a":[{"i":1},{"i":0}]},{"app":24},{"app":48,"a":[{"i":1},{"i":0}]}],"s":[{"g":["just like that","in the twinkling of an eye","in the blink of an eye","in the time it takes to say \\"ah!\\""],"pos":["exp","adv"],"gt":1024}]}
{"id":1000400,"r":["あっぷあっぷ"],"rm":[{"a":[{"i":1},{"i":4}]}],"s":[{"g":["floundering while nearly drowning"],"pos":["adv","adv-to","vs"]},{"g":["suffering"],"pos":["adv","adv-to","vs"]}]}
{"id":1000410,"r":["あどけない"],"rm":[{"a":4}],"s":[{"g":["innocent","cherubic","childlike"],"pos":["adj-i"]}]}
{"id":1000420,"k":["彼の"],"km":[{"i":["rK"]}],"r":["あの","あん"],"rm":[{"p":["s1"],"a":0},{"app":0}],"s":[{"g":["that","those","the"],"pos":["adj-pn"],"xref":[{"r":"どの"},{"r":"この","sense":1},{"r":"その","sense":1}],"misc":["uk"],"inf":"someone or something distant from both speaker and listener, or situation unfamiliar to both speaker and listener"}]}
{"id":1000430,"r":["あの","あのー","あのう"],"rm":[{"p":["s1"],"a":0},{"p":["s1"]},{"a":0}],"s":[{"g":["say","well","um","er"],"pos":["int"]}]}
{"id":1000440,"k":["あの人","彼の人"],"km":[{"p":["s1"]}],"r":["あのひと"],"rm":[{"p":["s1"],"a":[{"i":2},{"i":4}]}],"s":[{"g":["he","she","that person"],"pos":["pn"],"inf":"sometimes of one's spouse or partner"},{"g":["you"],"pos":["pn"],"misc":["arch"]}]}
{"id":1000450,"k":["あの方","彼の方"],"km":[{"p":["s1"]}],"r":["あのかた"],"rm":[{"p":["s1"],"a":[{"i":3},{"i":4}]}],"s":[{"g":["that gentleman","that lady","he","she"],"pos":["pn"],"misc":["hon"]}]}
{"id":1000460,"k":["溢れる"],"r":["あぶれる"],"rm":[{"a":3}],"s":[{"g":["to fail (in getting a job)","to miss out (at fishing, hunting, etc.)"],"pos":["v1","vi"],"misc":["uk"]},{"g":["to be left out","to be crowded out"],"pos":["v1","vi"],"misc":["uk"]}]}
{"id":1000470,"r":["あべこべ"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["contrary","opposite","inverse","reverse","back-to-front"],"pos":["adj-no","adj-na","n"],"misc":["on-mim"]}]}
{"id":1000480,"k":["阿呆陀羅"],"r":["あほんだら","あほだら"],"rm":[{"a":0},{"a":0}],"s":[{"g":["fool","oaf","airhead"],"pos":["n"],"misc":["uk"],"dial":["ks"]},{"g":["type of fast-paced humorous singing mimicking the chanting of a Buddhist sutra, usually with lyrics satirizing current events"],"rapp":2,"pos":["n"],"xref":[{"k":"あほだら経"}],"misc":["abbr"],"gt":1}]}
{"id":1000490,"k":["甘子","天魚","雨子"],"r":["あまご","アマゴ"],"rm":[{"a":0},{"app":0,"a":0}],"s":[{"g":["land-locked variety of red-spotted masu trout (Oncorhynchus masou ishikawae)","amago"],"pos":["n"],"xref":[{"k":"皐月鱒"}],"misc":["uk"]}]}
{"id":1000500,"r":["あやす"],"rm":[{"a":2}],"s":[{"g":["to cuddle","to comfort","to rock","to soothe","to dandle","to humor","to humour","to lull"],"pos":["v5s","vt"]}]}
{"id":1000510,"r":["あやふや"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["uncertain","vague","ambiguous"],"pos":["adj-na","n"],"misc":["on-mim"]}]}
{"id":1000520,"r":["あら"],"rm":[{"p":["i1"],"a":[{"i":1},{"i":0}]}],"s":[{"g":["oh","ah"],"pos":["int"],"misc":["fem"]}]}
{"id":1000525,"k":["𩺊"],"r":["あら","アラ"],"rm":[0,{"app":0}],"s":[{"g":["saw-edged perch (Niphon spinosus)"],"pos":["n"],"misc":["uk"]}]}
{"id":1000580,"k":["彼","彼れ"],"km":[{"i":["rK"]},{"i":["rK"]}],"r":["あれ","あ","アレ"],"rm":[{"p":["i1"],"a":0},{"app":1,"i":["ok"]},{"app":0,"a":0}],"s":[{"g":["that","that thing"],"pos":["pn"],"xref":[{"r":"これ","sense":1},{"r":"それ","sense":1},{"r":"どれ","sense":1}],"misc":["uk"],"inf":"indicating something distant from both speaker and listener (in space, time or psychologically), or something understood without naming it directly"},{"g":["that person"],"pos":["pn"],"misc":["uk"],"inf":"used to refer to one's equals or inferiors"},{"g":["then","that time"],"pos":["pn"],"misc":["uk"]},{"g":["that place (over there)"],"pos":["pn"],"misc":["uk"]},{"g":["down there (i.e. one's genitals)"],"pos":["n"],"misc":["col"],"inf":"esp. アレ"},{"g":["period","menses"],"pos":["n"],"misc":["col"],"inf":"esp. アレ"}]}
{"id":1000590,"r":["あんな"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["that sort of","that kind of","like that","such","so"],"pos":["adj-pn"],"xref":[{"r":"あんなに"},{"r":"こんな"},{"r":"そんな","sense":1},{"r":"どんな","sense":1}],"inf":"about something or someone distant from both speaker and listener, or about a situation unfamiliar to both speaker and listener"}]}
{"id":1000600,"k":["いい加減にしなさい"],"r":["いいかげんにしなさい"],"s":[{"g":["shape up!","act properly!"],"pos":["exp"]}]}
{"id":1000610,"k":["いい年をして"],"r":["いいとしをして"],"s":[{"g":["(in spite of) being old enough to know better"],"pos":["exp"],"xref":[{"k":"いい年して"}]}]}
{"id":1000620,"k":["否々","否否"],"km":[{"p":["i1"]}],"r":["いやいや","いえいえ"],"rm":[{"p":["i1"],"a":0},{"a":2}],"s":[{"g":["no!","no no!","no, not at all"],"pos":["int"],"xref":[{"k":"嫌々","r":"いやいや","sense":3}],"misc":["uk"]}]}
{"id":1000630,"k":["如何わしい"],"r":["いかがわしい"],"rm":[{"a":5}],"s":[{"g":["suspicious","dubious","unreliable"],"pos":["adj-i"],"misc":["uk"]},{"g":["indecent","unseemly"],"pos":["adj-i"],"misc":["uk"]}]}
{"id":1000640,"r":["いかす","イカす"],"rm":[{"a":0},{"a":0}],"s":[{"g":["to be smart","to be cool","to be sharp","to be stylish"],"pos":["v5s","vi"],"misc":["col"]}]}
{"id":1000650,"k":["いかなる場合でも"],"r":["いかなるばあいでも"],"s":[{"g":["in any case","whatever the case may be"],"pos":["exp"]}]}
{"id":1000660,"k":["如何にも"],"km":[{"p":["i1"]}],"r":["いかにも"],"rm":[{"p":["i1"],"a":2}],"s":[{"g":["indeed","really","truly","just (like)"],"pos":["adv"],"misc":["uk"],"inf":"indicating emotive conviction"},{"g":["very","extremely","totally","terribly"],"pos":["adv"],"misc":["uk"]},{"g":["absolutely","certainly","for sure"],"pos":["adv","int"],"misc":["uk"],"inf":"indicating agreement"}]}
{"id":1000710,"k":["幾つも"],"r":["いくつも"],"rm":[{"a":1}],"s":[{"g":["many","much","plenty"],"pos":["adv","adj-no"],"misc":["uk"]},{"g":["hardly"],"pos":["adv"],"misc":["uk"],"inf":"in neg. sentence"}]}
{"id":1000730,"k":["行けない"],"km":[{"p":["i1"]}],"r":["いけない"],"rm":[{"p":["i1"]}],"s":[{"g":["wrong","not good","of no use"],"pos":["exp"],"misc":["uk"]},{"g":["hopeless","past hope"],"pos":["exp"],"misc":["uk"]},{"g":["must not do"],"pos":["exp"],"misc":["uk"]}]}
{"id":1000740,"r":["いごっそう"],"rm":[{"a":2}],"s":[{"g":["stubborn person","strong-minded person","obstinate person"],"pos":["n"],"dial":["ts"]}]}
{"id":1000750,"r":["いざ"],"rm":[{"a":1}],"s":[{"g":["now","come (now)","well"],"pos":["adv","int"]}]}
{"id":1000760,"r":["いざこざ","イザコザ"],"rm":[{"p":["i1"],"a":0},{"a":0}],"s":[{"g":["trouble","quarrel","difficulties","complication","tangle"],"pos":["n"]}]}
{"id":1000770,"r":["イジイジ","いじいじ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["hesitantly","timidly","diffidently"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000780,"r":["いじける"],"rm":[{"a":0}],"s":[{"g":["to grow timid","to cower","to shrink","to lose one's nerve"],"pos":["v1","vi"]},{"g":["to become perverse","to become contrary","to become warped","to become withdrawn"],"pos":["v1","vi"]},{"g":["to be cramped","to be constrained"],"pos":["v1","vi"]}]}
{"id":1000790,"r":["いじましい","いぢましい"],"rm":[{"a":4}],"s":[{"g":["piddling","paltry"],"pos":["adj-i"]}]}
{"id":1000800,"r":["いじらしい"],"rm":[{"a":4}],"s":[{"g":["lovable","sweet","charming"],"pos":["adj-i"]},{"g":["pitiful","pathetic","touching"],"pos":["adj-i"]}]}
{"id":1000810,"k":["いじり回す","弄り回す","弄りまわす"],"r":["いじりまわす"],"s":[{"g":["to tinker with","to fumble with","to twist up"],"pos":["v5s"]}]}
{"id":1000820,"r":["いそいそ","イソイソ"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["cheerfully","excitedly"],"pos":["adv-to","adv","vs"],"misc":["on-mim"]}]}
{"id":1000830,"r":["イチャイチャ","いちゃいちゃ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["flirting","making out"],"pos":["adv","vs"]}]}
{"id":1000840,"r":["いちゃつく"],"rm":[{"a":[{"i":0},{"i":3}]}],"s":[{"g":["to flirt with","to dally"],"pos":["v5k","vi"]}]}
{"id":1000860,"k":["何時もより"],"r":["いつもより"],"s":[{"g":["more than usual"],"pos":["adv"],"misc":["uk"]}]}
{"id":1000870,"k":["いとも簡単に"],"r":["いともかんたんに"],"s":[{"g":["very easily"],"pos":["adv"]}]}
{"id":1000880,"k":["鯔背"],"r":["いなせ"],"rm":[{"a":0}],"s":[{"g":["gallant","dashing","smart"],"pos":["adj-na"],"misc":["uk"]}]}
{"id":1000885,"k":["嘶く"],"r":["いななく"],"rm":[{"a":[{"i":3},{"i":0}]}],"s":[{"g":["to neigh"],"pos":["v5k","vi"]}]}
{"id":1000890,"k":["嘶き"],"r":["いななき"],"rm":[{"a":0}],"s":[{"g":["neigh","whinny","bray"],"pos":["n"],"misc":["uk"]}]}
{"id":1000900,"r":["いびる"],"rm":[{"a":2}],"s":[{"g":["to pick on","to tease"],"pos":["v5r","vt"]}]}
{"id":1000910,"k":["嫌に","厭に"],"r":["いやに"],"s":[{"g":["awfully","terribly"],"pos":["adv"],"misc":["uk"]}]}
{"id":1000920,"r":["いらっしゃい","いらしゃい"],"rm":[{"p":["s1"],"a":4},{"i":["ik"]}],"s":[{"g":["come","go","stay"],"pos":["int"],"xref":[{"r":"いらっしゃる","sense":1}],"misc":["hon"],"inf":"used as a polite imperative"},{"g":["welcome"],"pos":["int"],"xref":[{"r":"いらっしゃいませ"}]}]}
{"id":1000930,"r":["いらっしゃいませ","いらしゃいませ"],"rm":[{"p":["i1"],"a":6},{"i":["ik"]}],"s":[{"g":["welcome"],"pos":["exp"],"inf":"used in shops, restaurants, etc."}]}
{"id":1000940,"r":["いらっしゃる"],"rm":[{"p":["i1"],"a":4}],"s":[{"g":["to come","to go","to be (somewhere)"],"pos":["v5aru","vi"],"misc":["hon"],"inf":"sometimes erroneously written 居らっしゃる"},{"g":["to be (doing)"],"pos":["v5aru","aux-v"],"misc":["hon"],"inf":"after a -te form, or the particle \\"de\\""}]}
{"id":1000960,"r":["うじうじ","ウジウジ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["irresolute","hesitant"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000970,"r":["うじゃうじゃ","ウジャウジャ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["in swarms","in clusters"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]},{"g":["tediously","slowly"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000980,"r":["うずうず","ウズウズ"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["itching to do something","impatient","sorely tempted","eager"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000990,"r":["うぞうぞ"],"s":[{"g":["irrepressibly aroused (esp. sexually)","stimulated"],"pos":["adv"],"misc":["on-mim"]}]}
{"id":1001000,"r":["うだうだ","ウダウダ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["going on and on (about inconsequential things)","talking nonsense"],"pos":["adv","vs"],"misc":["on-mim"]},{"g":["idling away the time","dawdling"],"pos":["adv","vs"],"misc":["on-mim"]}]}
{"id":1001010,"r":["うっかり","ウッカリ"],"rm":[{"p":["i1"],"a":3},{"a":3}],"s":[{"g":["carelessly","thoughtlessly","inadvertently"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001030,"r":["うとうと","ウトウト","うとっと","ウトッと","ウトっと"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["falling into a doze","dozing off","nodding off"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001040,"r":["うねうね","ウネウネ"],"rm":[{"a":1},{"a":1}],"s":[{"g":["winding","meandering","zigzagging","zig-zag","in twists and turns","sinuously","tortuously"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001050,"k":["畝り","畝ねり"],"km":[{"p":["i1"]},{"i":["io"]}],"r":["うねり"],"rm":[{"p":["i1"]}],"s":[{"g":["undulation","winding","meandering"],"pos":["n"],"misc":["uk"]},{"g":["swell (of waves)","surge","billow","roller"],"pos":["n"],"misc":["uk"]}]}
{"id":1001060,"r":["うろうろ","ウロウロ"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["restlessly","aimlessly","without purpose"],"pos":["adv","adv-to"],"misc":["on-mim"]},{"g":["to loiter","to drift","to hang about doing nothing","to wander aimlessly","to be restless"],"pos":["vs"],"xref":[{"k":"彷徨く","sense":1}],"misc":["on-mim"]},{"g":["to be restless","to fuss","to be in a fidget"],"pos":["vs"],"misc":["on-mim"]}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":3,"part":3,"format":"full"}
{"id":1001070,"k":["狼狽える"],"r":["うろたえる"],"rm":[{"a":[{"i":0},{"i":4}]}],"s":[{"g":["to be flustered","to lose one's presence of mind"],"pos":["v1","vi"],"misc":["uk"]}]}
{"id":1001090,"r":["うん","うむ","ううむ"],"rm":[{"p":["s1"],"a":1},{"a":1}],"s":[{"g":["yes","yeah","uh huh"],"pos":["int"]},{"g":["hum","hmmm","well","erm","huh?"],"pos":["int"]},{"g":["oof"],"rapp":1,"pos":["int"],"inf":"moan or groan (of pain)"}]}
{"id":1001110,"r":["うんざり","ウンザリ"],"rm":[{"p":["s1"],"a":3},{"a":3}],"s":[{"g":["tedious","boring","being fed up with"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
`
    );

    const abortController = new AbortController();
    const events = await drainEvents(
      download({
        lang: 'en',
        forceFetch: true,
        majorVersion: 1,
        series: 'words',
        signal: abortController.signal,
        maxProgressResolution: 0.05,
      }),
      { includeProgressEvents: true }
    );
    const progressEvents = events.filter(
      (event): event is ProgressEvent => event.type === 'progress'
    );

    // First check the file members: file, totalFiles
    assert.includeMembers(
      [3],
      progressEvents.map((e) => e.totalFiles),
      'The totalFiles member should be 3 for all events'
    );
    assert.includeMembers(
      [0, 1, 2],
      progressEvents.map((e) => e.file),
      'The file member should be in the range [0-2] for all events'
    );
    let previousFile;
    for (const event of progressEvents) {
      if (previousFile !== undefined) {
        assert.include(
          [previousFile, previousFile + 1],
          event.file,
          'The file members should be monotonically increasing'
        );
      }
      previousFile = event.file;
    }

    // Then check the progress within each file
    previousFile = undefined;
    let previousRead;
    let previousTotal;
    let previousPercent;
    for (const event of progressEvents) {
      // Check for a new file
      if (previousFile === event.file) {
        assert.strictEqual(event.total, previousTotal);
        assert.isAbove(event.read, previousRead as number);
        assert.isAtMost(
          event.read,
          event.total,
          `The number of records read (${event.read}) should be less than the total (${event.total})`
        );

        const percent = event.read / event.total;
        assert.isAtLeast(percent, 0);
        assert.isAtMost(percent, 1);
        // Check we maintain the maximum resolution, unless this is the final
        // progress event we add at the end.
        if (percent < 1) {
          assert.isAtLeast(
            percent - (previousPercent as number),
            0.05,
            `Progress event at ${
              percent * 100
            }% should be at least 5% greater than the previous progress ${
              (previousPercent as number) * 100
            }%`
          );
        }
      }

      previousFile = event.file;
      previousRead = event.read;
      previousTotal = event.total;
      previousPercent = event.read / event.total;
    }
  });
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
