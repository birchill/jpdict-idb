import { assert, use } from 'chai';
import chaiDateTime from 'chai-datetime';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { AbortError } from './abort-error';
import { JpdictIdb } from './database';
import { DownloadError } from './download-error';
import { clearCachedVersionInfo } from './download-version-info';

use(chaiDateTime);

const VERSION_INFO = {
  kanji: {
    '5': {
      major: 5,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
  radicals: {
    '4': {
      major: 4,
      minor: 0,
      patch: 0,
      dateOfCreation: '2019-09-06',
    },
  },
  names: {
    '3': {
      major: 3,
      minor: 0,
      patch: 0,
      dateOfCreation: '2020-08-22',
    },
  },
};

describe('JpdictIdb', function () {
  let db: JpdictIdb;

  before(() => {
    fetchMock.mockGlobal();
  });

  after(() => {
    fetchMock.unmockGlobal();
  });

  beforeEach(() => {
    db = new JpdictIdb();
    clearCachedVersionInfo();
  });

  afterEach(async () => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    sinon.restore();
    if (db) {
      await db.destroy();
    }
  });

  it('should initially be initializing', async () => {
    assert.equal(db.words.state, 'init');
    assert.equal(db.names.state, 'init');
    assert.equal(db.kanji.state, 'init');
    assert.equal(db.radicals.state, 'init');
    await db.ready;
  });

  it('should resolve to being empty', async () => {
    await db.ready;
    assert.equal(db.words.state, 'empty');
    assert.equal(db.names.state, 'empty');
    assert.equal(db.kanji.state, 'empty');
    assert.equal(db.radicals.state, 'empty');
  });

  it('should resolve the version after updating', async () => {
    await db.ready;
    assert.isNull(db.kanji.version);

    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    await db.update({ series: 'kanji', lang: 'en' });

    assert.deepEqual(db.kanji.version, {
      ...VERSION_INFO.kanji['5'],
      lang: 'en',
    });
    assert.equal(db.kanji.state, 'ok');
    assert.equal(db.radicals.state, 'ok');
  });

  it('should update the update state after updating', async () => {
    await db.ready;
    assert.deepEqual(db.kanji.updateState, { type: 'idle', lastCheck: null });
    assert.deepEqual(db.radicals.updateState, {
      type: 'idle',
      lastCheck: null,
    });

    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const updateStart = new Date();
    await db.update({ series: 'kanji', lang: 'en' });
    const updateEnd = new Date();

    assert.deepEqual(db.kanji.updateState.type, 'idle');
    assert.isNotNull(db.kanji.updateState.lastCheck);
    assert.deepEqual(db.radicals.updateState.type, 'idle');
    assert.isNotNull(db.radicals.updateState.lastCheck);
    assert.withinTime(db.kanji.updateState.lastCheck!, updateStart, updateEnd);
    assert.withinTime(
      db.radicals.updateState.lastCheck!,
      updateStart,
      updateEnd
    );
  });

  it('should ignore redundant calls to update', async () => {
    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const firstUpdate = db.update({ series: 'kanji', lang: 'en' });
    const secondUpdate = db.update({ series: 'kanji', lang: 'en' });

    await Promise.all([firstUpdate, secondUpdate]);

    assert.equal(
      fetchMock.callHistory.calls('end:kanji/en/5.0.0.jsonl').length,
      1,
      'Should only fetch things once'
    );
  });

  it('should cancel an existing update if the requested language changes', async () => {
    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      )
      .route('end:version-fr.json', VERSION_INFO)
      .route(
        'end:kanji/fr/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/fr/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const firstUpdate = db.update({ series: 'kanji', lang: 'en' });
    const secondUpdate = db.update({ series: 'kanji', lang: 'fr' });

    const [firstUpdateResult] = await Promise.all([
      firstUpdate.catch((e) => e),
      secondUpdate,
    ]);
    assert.instanceOf(firstUpdateResult, AbortError);

    assert.equal(db.kanji.version?.lang, 'fr');
  });

  it('should allow different series to be downloaded in parallel', async () => {
    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      )
      .route(
        'end:names/en/3.0.0.jsonl',
        `{"type":"header","version":{"major":3,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const kanjiUpdate = db.update({ series: 'kanji', lang: 'en' });
    const namesUpdate = db.update({ series: 'names', lang: 'en' });

    await Promise.all([kanjiUpdate, namesUpdate]);

    assert.equal(db.kanji.version?.major, 5);
    assert.equal(db.radicals.version?.major, 4);
    assert.equal(db.names.version?.major, 3);
  });

  it('should relay download errors', async () => {
    fetchMock.route('end:version-en.json', 404);

    let exception: unknown;
    try {
      await db.update({ series: 'kanji', lang: 'en' });
      console.log(fetchMock.callHistory.calls());
    } catch (e) {
      exception = e;
    }

    const isVersionFileNotFoundError = (e: unknown): e is DownloadError =>
      e instanceof DownloadError && e.code === 'VersionFileNotFound';

    // Check exception
    assert.isTrue(
      isVersionFileNotFoundError(exception),
      `Should have thrown a VersionFileNotFound exception. Got: ${exception}`
    );

    // Check update state
    assert.equal(db.kanji.updateState.type, 'idle');
    assert.equal(db.radicals.updateState.type, 'idle');
  });

  it('should allow canceling the update', async () => {
    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const update = db.update({ series: 'kanji', lang: 'en' });
    db.cancelUpdate('kanji');

    assert.instanceOf(await update.catch((e) => e), AbortError);

    assert.deepEqual(db.kanji.updateState, { type: 'idle', lastCheck: null });
    assert.deepEqual(db.radicals.updateState, {
      type: 'idle',
      lastCheck: null,
    });

    // Also check that a redundant call to cancelUpdate doesn't break anything.
    db.cancelUpdate('kanji');
  });

  it('should allow canceling the update mid-stream', async () => {
    fetchMock
      .route('end:version-en.json', {
        words: {
          '2': {
            major: 2,
            minor: 0,
            patch: 0,
            databaseVersion: '175',
            dateOfCreation: '2019-07-09',
            parts: 2,
          },
        },
      })
      // (We need to cancel from this second request, otherwise we don't seem to
      // exercise the code path where we actually cancel the reader.)
      .route('end:words/en/2.0.0-1.jsonl', () => {
        db.cancelUpdate('words');
        return '';
      });

    const update = db.update({ series: 'words', lang: 'en' });

    assert.match((await update.catch((e) => e))?.message, /aborted/);

    assert.deepEqual(db.words.updateState, { type: 'idle', lastCheck: null });

    assert.isFalse(
      fetchMock.callHistory.called('end:words/en/2.0.0-2.jsonl'),
      'Should not download next data file'
    );
  });

  it('should update the last check time if we wrote something', async () => {
    fetchMock
      .route('end:version-en.json', {
        words: {
          '2': {
            major: 2,
            minor: 0,
            patch: 0,
            databaseVersion: '175',
            dateOfCreation: '2019-07-09',
            parts: 2,
          },
        },
      })
      .route(
        'end:words/en/2.0.0-1.jsonl',
        `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2022-04-05"},"records":1,"part":1,"format":"full"}
{"id":1000000,"r":["ヽ"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"一の字点"}],"gt":1}]}
`
      )
      .route('end:words/en/2.0.0-2.jsonl', () => {
        db.cancelUpdate('words');
        return '';
      });

    const update = db.update({ series: 'words', lang: 'en' });

    assert.match((await update.catch((e) => e))?.message, /aborted/);

    assert.equal(db.words.updateState.type, 'idle');
    assert.isDefined(db.words.updateState.lastCheck);
  });

  it('should not update the database version if the update failed', async () => {
    await db.ready;
    assert.isNull(db.kanji.version);

    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';

    const stub = sinon.stub(db.store, 'updateDataVersion');
    stub.throws(constraintError);

    try {
      await db.update({ series: 'kanji', lang: 'en' });
    } catch {
      // Ignore
    }

    assert.strictEqual(db.kanji.version, null);
    assert.equal(db.kanji.state, 'empty');
  });

  it('should allow deleting data for a series', async () => {
    fetchMock
      .route('end:version-en.json', VERSION_INFO)
      .route(
        'end:kanji/en/5.0.0.jsonl',
        `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
      )
      .route(
        'end:radicals/en/4.0.0.jsonl',
        `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      )
      .route(
        'end:names/en/3.0.0.jsonl',
        `{"type":"header","version":{"major":3,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
      );

    const kanjiUpdate = db.update({ series: 'kanji', lang: 'en' });
    const namesUpdate = db.update({ series: 'names', lang: 'en' });

    await Promise.all([kanjiUpdate, namesUpdate]);
    await db.deleteSeries('kanji');

    assert.equal(db.kanji.state, 'empty');
    assert.equal(db.radicals.state, 'empty');
    assert.equal(db.names.state, 'ok');
  });
});
