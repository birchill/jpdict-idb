import chai, { assert } from 'chai';
import chaiDateTime from 'chai-datetime';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { DownloadError, DownloadErrorCode } from './download';
import { DataSeriesState, JpdictDatabase } from './database';
import { stripFields } from './utils';

mocha.setup('bdd');
chai.use(chaiDateTime);

const VERSION_INFO = {
  kanji: {
    '4': {
      major: 4,
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

describe('database', function () {
  let db: JpdictDatabase;

  // We seem to be timing out on Chrome recently
  this.timeout(15000);

  beforeEach(() => {
    db = new JpdictDatabase();
  });

  afterEach(async () => {
    fetchMock.restore();
    sinon.restore();
    if (db) {
      await db.destroy();
    }
  });

  it('should initially be initializing', async () => {
    assert.equal(db.kanji.state, DataSeriesState.Initializing);
    assert.equal(db.radicals.state, DataSeriesState.Initializing);
  });

  it('should resolve to being empty', async () => {
    await db.ready;
    assert.equal(db.kanji.state, DataSeriesState.Empty);
    assert.equal(db.radicals.state, DataSeriesState.Empty);
  });

  it('should resolve the version after updating', async () => {
    await db.ready;
    assert.isNull(db.kanji.version);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    assert.deepEqual(
      stripFields(db.kanji.version!, ['lang']),
      VERSION_INFO.kanji['4']
    );
    assert.equal(db.kanji.state, DataSeriesState.Ok);
    assert.equal(db.radicals.state, DataSeriesState.Ok);
  });

  it('should update the update state after updating', async () => {
    await db.ready;
    assert.deepEqual(db.kanji.updateState, { state: 'idle', lastCheck: null });
    assert.deepEqual(db.radicals.updateState, {
      state: 'idle',
      lastCheck: null,
    });

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const updateStart = new Date();
    await db.update({ series: 'kanji', lang: 'en' });
    const updateEnd = new Date();

    assert.deepEqual(db.kanji.updateState.state, 'idle');
    assert.isNotNull(db.kanji.updateState.lastCheck);
    assert.deepEqual(db.radicals.updateState.state, 'idle');
    assert.isNotNull(db.radicals.updateState.lastCheck);
    assert.withinTime(db.kanji.updateState.lastCheck!, updateStart, updateEnd);
    assert.withinTime(
      db.radicals.updateState.lastCheck!,
      updateStart,
      updateEnd
    );
  });

  it('should ignore redundant calls to update', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const firstUpdate = db.update({ series: 'kanji', lang: 'en' });
    const secondUpdate = db.update({ series: 'kanji', lang: 'en' });

    await Promise.all([firstUpdate, secondUpdate]);

    assert.equal(
      fetchMock.calls('end:kanji-rc-en-4.0.0.ljson').length,
      1,
      'Should only fetch things once'
    );
  });

  it('should cancel an existing update if the requested language changes', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    fetchMock.mock('end:jpdict-rc-fr-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-fr-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-fr-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    db.update({ series: 'kanji', lang: 'en' });
    const secondUpdate = db.update({ series: 'kanji', lang: 'fr' });

    await secondUpdate;

    assert.equal(db.kanji.version!.lang, 'fr');
  });

  it('should allow different series to be downloaded in parallel', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );
    fetchMock.mock(
      'end:names-rc-en-3.0.0.ljson',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );

    const kanjiUpdate = db.update({ series: 'kanji', lang: 'en' });
    const namesUpdate = db.update({ series: 'names', lang: 'en' });

    await Promise.all([kanjiUpdate, namesUpdate]);

    assert.equal(db.kanji.version!.major, 4);
    assert.equal(db.names.version!.major, 3);
  });

  it('should handle error actions', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', 404);

    let exception;
    try {
      await db.update({ series: 'kanji', lang: 'en' });
    } catch (e) {
      exception = e;
    }

    const isVersionFileNotFoundError = (e?: Error) =>
      e &&
      e instanceof DownloadError &&
      e.code === DownloadErrorCode.VersionFileNotFound;

    // Check exception
    assert.isTrue(
      isVersionFileNotFoundError(exception),
      `Should have thrown a VersionFileNotFound exception. Got: ${exception}`
    );

    // Check update state
    assert.equal(db.kanji.updateState.state, 'idle');
    assert.equal(db.radicals.updateState.state, 'idle');
  });

  it('should allow canceling the update', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const update = db.update({ series: 'kanji', lang: 'en' });
    db.cancelUpdate({ series: 'kanji' });

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.deepEqual(db.kanji.updateState, { state: 'idle', lastCheck: null });
    assert.deepEqual(db.radicals.updateState, {
      state: 'idle',
      lastCheck: null,
    });

    // Also check that a redundant call to cancelUpdate doesn't break anything.
    db.cancelUpdate({ series: 'kanji' });
  });

  it('should allow canceling the update mid-stream', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', {
      kanji: {
        '4': {
          ...VERSION_INFO.kanji['4'],
          patch: 1,
        },
      },
    });
    // (We need to cancel from this second request, otherwise we don't seem to
    // exercise the code path where we actually cancel the reader.)
    fetchMock.mock('end:kanji-rc-en-4.0.0.ljson', () => {
      db.cancelUpdate({ series: 'kanji' });
      return '';
    });

    const update = db.update({ series: 'kanji', lang: 'en' });

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.deepEqual(db.kanji.updateState, { state: 'idle', lastCheck: null });
    assert.deepEqual(db.radicals.updateState, {
      state: 'idle',
      lastCheck: null,
    });

    assert.isFalse(
      fetchMock.called('end:kanji-rc-en-4.0.1.ljson'),
      'Should not download next data file'
    );
  });

  it('should update the last check time if we wrote something', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', {
      kanji: {
        '4': {
          ...VERSION_INFO.kanji['4'],
          patch: 1,
        },
      },
    });
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `
{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.mock('end:kanji-rc-en-4.0.1.ljson', () => {
      db.cancelUpdate({ series: 'kanji' });
      return '';
    });

    const update = db.update({ series: 'kanji', lang: 'en' });

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.equal(db.kanji.updateState.state, 'idle');
    assert.isDefined(db.kanji.updateState.lastCheck);
  });

  it('should not update the database version if the update failed', async () => {
    await db.ready;
    assert.isNull(db.kanji.version);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';

    const stub = sinon.stub(db.store, 'bulkUpdateTable');
    stub.throws(constraintError);

    try {
      await db.update({ series: 'kanji', lang: 'en' });
    } catch (e) {
      // Ignore
    }

    assert.strictEqual(db.kanji.version, null);
    assert.equal(db.kanji.state, DataSeriesState.Empty);
  });

  it('should allow deleting data for a series', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );
    fetchMock.mock(
      'end:names-rc-en-3.0.0.ljson',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );

    const kanjiUpdate = db.update({ series: 'kanji', lang: 'en' });
    const namesUpdate = db.update({ series: 'names', lang: 'en' });

    await Promise.all([kanjiUpdate, namesUpdate]);
    await db.deleteSeries('kanji');

    assert.equal(db.kanji.state, DataSeriesState.Empty);
    assert.equal(db.radicals.state, DataSeriesState.Empty);
    assert.equal(db.names.state, DataSeriesState.Ok);
  });
});
