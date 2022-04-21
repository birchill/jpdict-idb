import chai, { assert } from 'chai';
import chaiDateTime from 'chai-datetime';
import chaiAsPromised from 'chai-as-promised';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { JpdictIdb } from './database-v2';
import { cancelUpdateWithRetry, updateWithRetry } from './update-with-retry';

mocha.setup('bdd');
chai.use(chaiDateTime);
chai.use(chaiAsPromised);

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
      dateOfCreation: '2019-09-06',
    },
  },
};

describe('updateWithRetry', function () {
  let db: JpdictIdb;

  // We time out some of these tests occasionally.
  this.timeout(10000);

  beforeEach(() => {
    db = new JpdictIdb();
  });

  afterEach(async () => {
    fetchMock.restore();
    sinon.restore();
    if (db) {
      await db.destroy();
    }
  });

  it('should call the onUpdateComplete callback on success', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
  });

  it('should call the onUpdateError callback on complete failure', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Force an error to occur
    sinon.replace(db, 'update', () => {
      throw new Error('Forced error');
    });

    const retryPromise = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
    return assert.isRejected(retryPromise, /Forced error/);
  });

  it('should retry a network error', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    const errors: Array<{
      error: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];
    const updateStart = new Date();

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: (params) => {
          errors.push(params);
          void clock.runToLastAsync();
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 1);
    assert.equal(errors[0].error.name, 'DownloadError');

    const { nextRetry, retryCount } = errors[0];
    assert.instanceOf(nextRetry, Date);
    // If this turns out to be flaky, we shoud work out how to use sinon fake
    // timers properly.
    assert.withinTime(
      nextRetry!,
      new Date(updateStart.getTime() + 1000),
      new Date(updateStart.getTime() + 10 * 1000)
    );
    assert.strictEqual(retryCount, 0);
  });

  it('should wait until it is online', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    let isOnline = false;

    sinon.replaceGetter(
      navigator,
      'onLine',
      sinon.fake(() => isOnline)
    );

    let gotOfflineError = false;

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => {
          assert.equal(error.name, 'OfflineError');
          gotOfflineError = true;
          isOnline = true;
          window.dispatchEvent(new Event('online'));
        },
      });
    });

    assert.isTrue(gotOfflineError);
  });

  it('should wait until it is online even when re-trying a network error', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock('end:.jsonl', 404, { repeat: 2 });
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    let isOnline = true;
    sinon.replaceGetter(
      navigator,
      'onLine',
      sinon.fake(() => isOnline)
    );

    const errors: Array<{
      error: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error, nextRetry, retryCount }) => {
          errors.push({
            error,
            nextRetry,
            retryCount,
          });

          if (error.name === 'OfflineError') {
            isOnline = true;
            window.dispatchEvent(new Event('online'));
            return;
          }

          if (retryCount && retryCount >= 1) {
            isOnline = false;
          }

          void clock.runToLastAsync();
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 3);

    assert.equal(errors[0].error.name, 'DownloadError');
    assert.strictEqual(errors[0].retryCount, 0);

    assert.equal(errors[1].error.name, 'DownloadError');
    assert.strictEqual(errors[1].retryCount, 1);

    assert.equal(errors[2].error.name, 'OfflineError');
    assert.strictEqual(errors[2].retryCount, undefined);
  });

  it('should coalesce overlapping requests', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    const firstInvocation = new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: () => {
          void clock.runToLastAsync();
        },
      });
    });

    let secondCompletionCallbackCalled = false;
    const secondInvocation = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: () => {
          secondCompletionCallbackCalled = true;
          resolve();
        },
        onUpdateError: ({ error }) => reject(error),
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);

    clock.restore();

    assert.isFalse(secondCompletionCallbackCalled);
  });

  it('should NOT coalesce overlapping requests when the updateNow flag is set', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for the first invocation to error

    let firstInvocation;
    const firstError = new Promise((firstErrorResolve) => {
      firstInvocation = new Promise((_, reject) => {
        updateWithRetry({
          db,
          series: 'kanji',
          lang: 'en',
          onUpdateComplete: reject,
          onUpdateError: firstErrorResolve,
        });
      });
    });

    await firstError;

    // Then try again while it is waiting

    const secondInvocation = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        updateNow: true,
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);
  });

  it('should NOT coalesce overlapping requests when the requested language changes', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock('end:version-fr.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:kanji/fr/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/fr/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for the first invocation to error

    let firstInvocation;
    const firstError = new Promise((firstErrorResolve) => {
      firstInvocation = new Promise((_, reject) => {
        updateWithRetry({
          db,
          series: 'kanji',
          lang: 'en',
          onUpdateComplete: reject,
          onUpdateError: firstErrorResolve,
        });
      });
    });

    await firstError;

    // Then try again while it is waiting

    const secondInvocation = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'fr',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);

    assert.equal(db.kanji.version!.lang, 'fr');
  });

  it('should allow canceling the retries', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for first error

    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });

    let completeCalled = false;
    await new Promise((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then cancel

    cancelUpdateWithRetry({ db, series: 'kanji' });

    // Then make sure that the completion doesn't happen

    void clock.runAllAsync();
    clock.restore();

    // It turns out we need to wait quiet a few frames to be sure the completion
    // would happen if we hadn't canceled things.
    await waitForAnimationFrames(8);

    assert.isFalse(completeCalled);
  });

  it('should cancel the retries when the database is deleted', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for first error

    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });

    let completeCalled = false;
    await new Promise((resolve) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then destroy database

    await db.destroy();

    // Then make sure that the completion doesn't happen

    void clock.runToLastAsync();
    clock.restore();
    await waitForAnimationFrames(15); // We seem to need at least ~15

    assert.isFalse(completeCalled);
  });

  it('should reset the timeout after each successful download', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock('end:.jsonl', 404, { repeat: 2 });
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );

    // Make radical file fail only once
    let callCount = 0;
    fetchMock.mock('end:radicals/en/4.0.0.jsonl', () => {
      if (callCount++) {
        return `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`;
      } else {
        return 404;
      }
    });

    const clock = sinon.useFakeTimers({
      now: Date.now(),
      toFake: ['setTimeout'],
    });

    const errors: Array<{
      error: Error;
      retryInterval?: number;
      retryCount?: number;
    }> = [];

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error, nextRetry, retryCount }) => {
          errors.push({
            error,
            retryInterval: nextRetry
              ? nextRetry.getTime() - Date.now()
              : undefined,
            retryCount,
          });
          if (!nextRetry) {
            reject(error);
          } else {
            void clock.runAllAsync();
          }
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 3);

    // The first two failures should have increasing retry intervals
    assert.isBelow(errors[0].retryInterval!, errors[1].retryInterval!);
    // The third failure should have a less (or equal) interval to the second
    // one
    assert.isAtMost(errors[2].retryInterval!, errors[1].retryInterval!);

    // The retry count should be reset too
    assert.deepEqual(
      errors.map((e) => e.retryCount),
      [0, 1, 0]
    );
  });

  it('should retry when saving to the database fails', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const stub = sinon.stub(db, 'update');
    stub.onFirstCall().throws('ConstraintError');
    stub.onSecondCall().throws('ConstraintError');

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
  });

  it('should give up after saving to the database fails too many times', async () => {
    fetchMock.mock('end:version-en.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.mock(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';

    const stub = sinon.stub(db.store, 'updateSeries');
    stub.throws(constraintError);

    const errors: Array<Error> = [];

    const updateResult = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        series: 'kanji',
        lang: 'en',
        onUpdateComplete: resolve,
        onUpdateError: ({ error, nextRetry }) => {
          errors.push(error);
          if (!nextRetry) {
            reject(error);
          }
        },
      });
    });

    await assert.isRejected(updateResult, constraintError);

    // Wait a moment to check there are no further errors reported
    await waitForAnimationFrames(1);

    assert.lengthOf(errors, 1);
  });
});

function waitForAnimationFrames(frameCount: number): Promise<void> {
  return new Promise((resolve) => {
    function handleFrame() {
      if (--frameCount <= 0) {
        resolve();
      } else {
        requestAnimationFrame(handleFrame);
      }
    }
    requestAnimationFrame(handleFrame);
  });
}
