import fetchMock from 'fetch-mock';
import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { JpdictIdb } from './database.js';
import { clearCachedVersionInfo } from './download-version-info.js';
import { cancelUpdateWithRetry, updateWithRetry } from './update-with-retry.js';

const fastSetTimeout = (cb: () => void) => {
  return self.setTimeout(cb, 0);
};

const VERSION_INFO = {
  kanji: {
    '5': {
      major: 4,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
  radicals: {
    '4': { major: 4, minor: 0, patch: 0, dateOfCreation: '2019-09-06' },
  },
  names: {
    '3': { major: 3, minor: 0, patch: 0, dateOfCreation: '2019-09-06' },
  },
};

describe('updateWithRetry', function () {
  let db: JpdictIdb;

  beforeAll(() => {
    fetchMock.mockGlobal();
  });

  afterAll(() => {
    fetchMock.unmockGlobal();
  });

  beforeEach(() => {
    db = new JpdictIdb();
    clearCachedVersionInfo();
  });

  afterEach(async () => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    vi.resetAllMocks();
    if (db) {
      await db.destroy();
    }
  });

  it('should call the onUpdateComplete callback on success', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
  });

  it('should call the onUpdateError callback on complete failure', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Force an error to occur
    vi.spyOn(db, 'update').mockRejectedValue(new Error('Forced error'));

    const retryPromise = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
    return assert.match(
      (await retryPromise.catch((e) => e))?.message,
      /Forced error/
    );
  });

  it('should retry a network error', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const errors: Array<{
      error: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];
    const updateStart = new Date();

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
        onUpdateComplete: resolve,
        onUpdateError: (params) => {
          errors.push(params);
        },
      });
    });

    assert.lengthOf(errors, 1);
    assert.equal(errors[0]!.error.name, 'DownloadError');

    const { nextRetry, retryCount } = errors[0]!;
    assert.instanceOf(nextRetry, Date);
    // If this turns out to be flaky, we shoud work out how to use sinon fake
    // timers properly.
    expect(nextRetry!).toBeWithinRange(
      new Date(updateStart.getTime() + 1000),
      new Date(updateStart.getTime() + 10 * 1000)
    );
    assert.strictEqual(retryCount, 0);
  });

  it('should wait until it is online', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    let isOnline = false;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => isOnline);

    let gotOfflineError = false;

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
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
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route('end:.jsonl', 404, { repeat: 2 });
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    let isOnline = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => isOnline);

    const errors: Array<{
      error: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];

    await new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
        onUpdateComplete: resolve,
        onUpdateError: ({ error, nextRetry, retryCount }) => {
          errors.push({ error, nextRetry, retryCount });

          if (error.name === 'OfflineError') {
            isOnline = true;
            window.dispatchEvent(new Event('online'));
            return;
          }

          if (retryCount && retryCount >= 1) {
            isOnline = false;
          }
        },
      });
    });

    assert.lengthOf(errors, 3);

    assert.equal(errors[0]?.error.name, 'DownloadError');
    assert.strictEqual(errors[0]?.retryCount, 0);

    assert.equal(errors[1]?.error.name, 'DownloadError');
    assert.strictEqual(errors[1]?.retryCount, 1);

    assert.equal(errors[2]?.error.name, 'OfflineError');
    assert.strictEqual(errors[2]?.retryCount, undefined);
  });

  it('should coalesce overlapping requests', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const firstInvocation = new Promise<void>((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
        onUpdateComplete: resolve,
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

    assert.isFalse(secondCompletionCallbackCalled);
  });

  it('should NOT coalesce overlapping requests when the updateNow flag is set', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
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
          lang: 'en',
          series: 'kanji',
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
        lang: 'en',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
        updateNow: true,
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);
  });

  it('should NOT coalesce overlapping requests when the requested language changes', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route('end:version-fr.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:kanji/fr/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
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
          lang: 'en',
          series: 'kanji',
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
        lang: 'fr',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);

    assert.equal(db.kanji.version!.lang, 'fr');
  });

  it('should allow canceling the retries', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for first error

    let completeCalled = false;
    await new Promise((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then cancel

    cancelUpdateWithRetry({ db, series: 'kanji' });

    // Then make sure that the completion doesn't happen

    // It turns out we need to wait quiet a few frames to be sure the completion
    // would happen if we hadn't canceled things.
    await waitForAnimationFrames(8);

    assert.isFalse(completeCalled);
  });

  it('should cancel the retries when the database is deleted', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.once('end:.jsonl', 404);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    // Wait for first error

    let completeCalled = false;
    await new Promise((resolve) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then destroy database

    await db.destroy();

    // Then make sure that the completion doesn't happen

    await waitForAnimationFrames(15); // We seem to need at least ~15

    assert.isFalse(completeCalled);
  });

  it('should reset the timeout after each successful download', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route('end:.jsonl', 404, { repeat: 2 });
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );

    // Make radical file fail only once
    let callCount = 0;
    fetchMock.route('end:radicals/en/4.0.0.jsonl', () => {
      if (callCount++) {
        return `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`;
      } else {
        return 404;
      }
    });

    const errors: Array<{
      error: Error;
      retryInterval?: number;
      retryCount?: number;
    }> = [];

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        setTimeout: fastSetTimeout,
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
          }
        },
      });
    });

    assert.lengthOf(errors, 3);

    // The first two failures should have increasing retry intervals
    assert.isBelow(errors[0]!.retryInterval!, errors[1]!.retryInterval!);
    // The third failure should have a less (or equal) interval to the second
    // one
    assert.isAtMost(errors[2]!.retryInterval!, errors[1]!.retryInterval!);

    // The retry count should be reset too
    assert.deepEqual(
      errors.map((e) => e.retryCount),
      [0, 1, 0]
    );
  });

  it('should retry when saving to the database fails', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';
    vi.spyOn(db, 'update')
      .mockRejectedValueOnce(constraintError)
      .mockRejectedValueOnce(constraintError);

    await new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error }) => reject(error),
      });
    });
  });

  it('should give up after saving to the database fails too many times', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0,"format":"full"}
`
    );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';

    vi.spyOn(db.store, 'updateDataVersion').mockImplementation(() => {
      throw constraintError;
    });

    const errors: Array<Error> = [];

    const updateResult = new Promise<void>((resolve, reject) => {
      updateWithRetry({
        db,
        lang: 'en',
        series: 'kanji',
        onUpdateComplete: resolve,
        onUpdateError: ({ error, nextRetry }) => {
          errors.push(error);
          if (!nextRetry) {
            reject(error);
          }
        },
      });
    });

    assert.strictEqual(await updateResult.catch((e) => e), constraintError);

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
