import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiLike from 'chai-like';
import fetchMock from 'fetch-mock';
import { AbortError } from './abort-error';
import { DownloadError } from './download-error';

import { download, DownloadEvent } from './download-v2';
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
});

async function drainEvents(
  downloader: AsyncIterableIterator<DownloadEvent>,
  { wrapError = false }: { wrapError?: boolean } = {}
): Promise<Array<DownloadEvent>> {
  const events: Array<DownloadEvent> = [];

  try {
    for await (const event of downloader) {
      events.push(event);
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
