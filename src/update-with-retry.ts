import { DataSeries, MajorDataSeries } from './data-series.js';
import { ChangeCallback, ChangeTopic, JpdictIdb } from './database.js';
import { DownloadError } from './download-error.js';
import { OfflineError } from './offline-error.js';
import {
  cancelIdleCallback,
  requestIdleCallback,
} from './request-idle-callback.js';
import { getUpdateKey } from './update-key.js';
import { UpdatingUpdateState } from './update-state.js';

export type UpdateCompleteCallback = () => void;
export type UpdateErrorCallback = (params: {
  error: Error;
  nextRetry?: Date;
  retryCount?: number;
}) => void;

// We allow passing in a custom setTimeout implementation so that unit tests
// can mock it, because overriding the global definition interferes with
// playwright, and sinon can't mock ES6 dependencies:
//
// https://github.com/hugomrdias/playwright-test/issues/426
// https://github.com/microsoft/playwright/issues/9123
// https://github.com/sinonjs/sinon/issues/1711
type SetTimeoutFn = (cb: () => void, duration: number) => number;

// Updates the passed-in database and retries in the case of failure due to
// network failures or being offline.
//
// Note that if there is an existing call to this function in motion
// (including waiting to retry) the existing call will be re-used.
// As a result, if the passed-in callback functions differ between invocations,
// only the originally passed-in callback functions will be called.
//
// (This is fixable but it introduces complexity and currently all clients
// have a single point where they call into this so it is not necessary to try
// and store a list of callback functions.)
//
// If the `updateNow` parameter is set then an existing call to this function
// will be canceled first UNLESS it is already running or blocked due to being
// offline. That is, the `updateNow` flag is meant to say, "Update now if you
// are not already."
//
// Furthermore, note that if an invocation is canceled there is no abort
// callback or AbortError or anything of the sort. (Again, this is fixable but
// it requires us to store the callbacks passed-in, and currently no client
// needs this.)
export function updateWithRetry({
  db,
  lang,
  series,
  onUpdateComplete,
  onUpdateError,
  setTimeout = self.setTimeout,
  updateNow = false,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
  setTimeout?: SetTimeoutFn;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
  updateNow?: boolean;
}) {
  startUpdate({
    db,
    lang,
    series,
    setTimeout,
    onUpdateComplete,
    onUpdateError,
    updateNow,
  });
}

function runUpdate({
  db,
  lang,
  series,
  setTimeout,
  onUpdateComplete,
  onUpdateError,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
  setTimeout: SetTimeoutFn;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
}) {
  // If we are offline, wait until we are online.
  if (!navigator.onLine) {
    const onlineCallback = async () => {
      runUpdate({
        db,
        lang,
        series,
        setTimeout,
        onUpdateComplete,
        onUpdateError,
      });
    };

    addEventListener('online', onlineCallback, { once: true });
    goOffline({ db, series, lang, onlineCallback });
    onUpdateError?.({ error: new OfflineError() });
    return;
  }

  // Transition to updating state.
  beginUpdating({ db, series, lang });

  // Actually run the update and handle any errors
  void (async () => {
    try {
      await db.update({ series, lang });

      resetUpdate({ db, series });

      if (db.isVerbose) {
        console.log('Successfully completed update.');
      }

      onUpdateComplete?.();
    } catch (e) {
      if (db.isVerbose) {
        console.error('Got error while updating', e);
      }

      let retryCount: number | undefined;
      let nextRetry: Date | undefined;
      let suppressError = false;

      // Retry network errors at decreasing intervals
      const isNetworkError = e instanceof DownloadError;
      if (isNetworkError) {
        const scheduleResult = maybeScheduleRetry({
          db,
          lang,
          series,
          setTimeout,
          onUpdateComplete,
          onUpdateError,
        });
        if (scheduleResult) {
          ({ nextRetry, retryCount } = scheduleResult);
        }
      } else if (e && e instanceof Error && e.name === 'ConstraintError') {
        const scheduleResult = maybeScheduleIdleRetry({
          db,
          lang,
          series,
          setTimeout,
          onUpdateComplete,
          onUpdateError,
        });
        if (scheduleResult) {
          ({ retryCount } = scheduleResult);
        }

        suppressError = !!scheduleResult;
      } else {
        resetUpdate({ db, series });
      }

      if (!suppressError && onUpdateError) {
        const error = e instanceof Error ? e : new Error(String(e));
        onUpdateError({ error, nextRetry, retryCount });
      }
    }
  })();
}

function onDatabaseChange({
  db,
  series,
  topic,
}: {
  db: JpdictIdb;
  series: MajorDataSeries;
  topic: ChangeTopic;
}) {
  // If the database was deleted, cancel any scheduled retries.
  if (topic === 'deleted') {
    resetUpdate({ db, series });
    return;
  }

  // topic === 'stateupdated'
  //
  // If we successfully downloaded *something*, reset the retry interval.
  //
  // We should only do this when we have a retry interval set since we DON'T
  // want to reset the retry count if we are retrying due to a database error.
  const seriesHasProgress = (series: DataSeries) =>
    db[series].updateState.type === 'updating' &&
    (db[series].updateState as UpdatingUpdateState).fileProgress > 0;
  const downloadedSomething =
    series === 'kanji'
      ? seriesHasProgress('kanji') || seriesHasProgress('radicals')
      : seriesHasProgress(series);

  if (downloadedSomething) {
    clearRetryInterval({ db, series });
  }
}

export function cancelUpdateWithRetry({
  db,
  series,
}: {
  db: JpdictIdb;
  series: MajorDataSeries;
}) {
  resetUpdate({ db, series });
}

// ---------------------------------------------------------------------------
//
// State management
//
// ---------------------------------------------------------------------------

type RetryState =
  | {
      type: 'offline';
      lang: string;
      changeCallback: ChangeCallback;
      onlineCallback: () => any;
    }
  | {
      type: 'updating';
      lang: string;
      changeCallback: ChangeCallback;
      retryIntervalMs?: number;
      retryCount?: number;
    }
  | {
      type: 'waiting-for-timeout';
      lang: string;
      changeCallback: ChangeCallback;
      setTimeoutHandle: number;
      retryIntervalMs: number;
      retryCount: number;
    }
  | {
      type: 'waiting-for-idle';
      lang: string;
      changeCallback: ChangeCallback;
      requestIdleCallbackHandle: number;
      retryCount: number;
    };

const inProgressUpdates: Map<string, RetryState> = new Map();

// ---------------------------------------------------------------------------
//
// State transitions
//
// ---------------------------------------------------------------------------

function startUpdate({
  db,
  lang,
  series,
  setTimeout,
  onUpdateComplete,
  onUpdateError,
  updateNow,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
  setTimeout: SetTimeoutFn;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
  updateNow: boolean;
}) {
  // Check if we have an in-progress update.
  const updateKey = getUpdateKey(db, series);
  let retryState = inProgressUpdates.get(updateKey);

  // If the languages differ, we should cancel the existing update.
  if (retryState && retryState.lang !== lang) {
    if (db.isVerbose) {
      console.info(
        'Canceling existing call to updateWithRetry because the requested language has changed.'
      );
    }
    resetUpdate({ db, series });
  }

  // Re-fetch the retry status since we may have canceled it.
  retryState = inProgressUpdates.get(updateKey);
  if (retryState) {
    // If we are not trying to force an update then use the existing in-progress
    // update.
    if (!updateNow) {
      if (db.isVerbose) {
        console.info(
          'Overlapping calls to updateWithRetry. Re-using existing invocation. This could be problematic if different callback functions were passed on each invocation.'
        );
      }
      return;
    }

    // If we're offline, then we're not even going to try updating until we
    // are online (at which point we will retry immediately).
    if (retryState.type === 'offline') {
      if (db.isVerbose) {
        console.info('Deferring forced update. Currently offline.');
      }
      return;
    }

    // Even if we are trying to force the update, if we just started an update
    // (or are retrying rapidly) then use the existing update.
    if (retryState.type === 'updating') {
      if (db.isVerbose) {
        console.info('Skipping forced update. Already updating presently.');
      }
      return;
    }

    // Otherwise, cancel the in-progress update.
    if (db.isVerbose) {
      console.log('Canceling existing queued retry.');
    }
    resetUpdate({ db, series });
  }

  // If we _still_ have an in-progress update here, it means we got an
  // overlapping call to this method while we were waiting to cancel the
  // previous in-progress update.
  retryState = inProgressUpdates.get(updateKey);
  if (retryState) {
    if (db.isVerbose) {
      console.log('Skipping overlapping auto-retry request.');
    }
    return;
  }

  runUpdate({ db, lang, series, setTimeout, onUpdateComplete, onUpdateError });
}

function resetUpdate({
  db,
  series,
}: {
  db: JpdictIdb;
  series: MajorDataSeries;
}) {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);
  if (!retryState) {
    return;
  }

  switch (retryState.type) {
    case 'offline':
      removeEventListener('online', retryState.onlineCallback);
      break;

    case 'waiting-for-timeout':
      clearTimeout(retryState.setTimeoutHandle);
      break;

    case 'waiting-for-idle':
      cancelIdleCallback(retryState.requestIdleCallbackHandle);
      break;
  }

  db.removeChangeListener(retryState.changeCallback);
  inProgressUpdates.delete(updateKey);

  db.cancelUpdate(series);
}

function goOffline({
  db,
  lang,
  onlineCallback,
  series,
}: {
  db: JpdictIdb;
  lang: string;
  onlineCallback: () => any;
  series: MajorDataSeries;
}) {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);
  if (retryState) {
    resetUpdate({ db, series });
  }

  inProgressUpdates.set(updateKey, {
    type: 'offline',
    lang,
    onlineCallback,
    changeCallback: getOrRegisterChangeCallback({ db, series }),
  });
}

function beginUpdating({
  db,
  lang,
  series,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
}) {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);

  inProgressUpdates.set(updateKey, {
    type: 'updating',
    lang,
    changeCallback: getOrRegisterChangeCallback({ db, series }),
    retryCount: getRetryCount(retryState),
    retryIntervalMs: getRetryIntervalMs(retryState),
  });
}

function maybeScheduleRetry({
  db,
  lang,
  series,
  setTimeout,
  onUpdateComplete,
  onUpdateError,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
  setTimeout: SetTimeoutFn;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
}): { retryCount: number; nextRetry: Date } | undefined {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);

  // If we are not updating to begin with, don't schedule a retry since it
  // probably means we were canceled.
  if (retryState?.type !== 'updating') {
    return undefined;
  }

  let retryIntervalMs = retryState.retryIntervalMs;
  if (retryIntervalMs) {
    // Don't let the interval become longer than 12 hours
    retryIntervalMs = Math.min(retryIntervalMs * 2, 12 * 60 * 60 * 1000);
  } else {
    // Randomize the initial interval to somewhere between 3s ~ 6s.
    retryIntervalMs = 3000 + Math.random() * 3000;
  }

  let retryCount = retryState.retryCount;
  retryCount = typeof retryCount === 'number' ? retryCount + 1 : 0;

  if (db.isVerbose) {
    console.log(`Scheduling retry of update in ${retryIntervalMs}ms`);
  }

  const setTimeoutHandle = setTimeout(() => {
    if (db.isVerbose) {
      console.log('Running automatic retry of update...');
    }

    runUpdate({
      db,
      lang,
      series,
      setTimeout,
      onUpdateComplete,
      onUpdateError,
    });
  }, retryIntervalMs) as unknown as number;

  const nextRetry = new Date(Date.now() + retryIntervalMs);

  inProgressUpdates.set(updateKey, {
    type: 'waiting-for-timeout',
    lang,
    changeCallback: getOrRegisterChangeCallback({ db, series }),
    retryCount,
    retryIntervalMs,
    setTimeoutHandle,
  });

  return { nextRetry, retryCount };
}

function clearRetryInterval({
  db,
  series,
}: {
  db: JpdictIdb;
  series: MajorDataSeries;
}) {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);

  // The check here for `retryIntervalMs` being set ensures we don't clear the
  // interval when we call this as a result of an idle callback running.
  if (retryState?.type !== 'updating' || !retryState.retryIntervalMs) {
    return;
  }

  inProgressUpdates.set(updateKey, {
    ...retryState,
    retryIntervalMs: undefined,
    retryCount: undefined,
  });
}

function maybeScheduleIdleRetry({
  db,
  lang,
  series,
  setTimeout,
  onUpdateComplete,
  onUpdateError,
}: {
  db: JpdictIdb;
  lang: string;
  series: MajorDataSeries;
  setTimeout: SetTimeoutFn;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
}): { retryCount: number } | undefined {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);

  // If we are not updating to begin with, don't schedule a retry since it
  // probably means we were canceled.
  if (retryState?.type !== 'updating') {
    return undefined;
  }

  // We only want to do this kind of rapid retry a few times (it's for database
  // errors).
  let retryCount = retryState.retryCount;
  if (retryCount && retryCount >= 2) {
    return undefined;
  }

  retryCount = typeof retryCount === 'number' ? retryCount + 1 : 0;

  if (db.isVerbose) {
    console.log('Retrying update momentarily');
  }

  const requestIdleCallbackHandle = requestIdleCallback(
    () => {
      if (db.isVerbose) {
        console.log('Running automatic retry of update...');
      }

      runUpdate({
        db,
        lang,
        series,
        setTimeout,
        onUpdateComplete,
        onUpdateError,
      });
    },
    { timeout: 2000 }
  );

  inProgressUpdates.set(updateKey, {
    type: 'waiting-for-idle',
    lang,
    changeCallback: getOrRegisterChangeCallback({ db, series }),
    requestIdleCallbackHandle,
    retryCount,
  });

  return { retryCount };
}

// ----------------------------------------------------------------------------
//
// State helpers
//
// ----------------------------------------------------------------------------

function getOrRegisterChangeCallback({
  db,
  series,
}: {
  db: JpdictIdb;
  series: MajorDataSeries;
}): ChangeCallback {
  const updateKey = getUpdateKey(db, series);
  const retryState = inProgressUpdates.get(updateKey);
  if (retryState) {
    return retryState.changeCallback;
  }

  const changeCallback = (topic: ChangeTopic) =>
    onDatabaseChange({ db, series, topic });
  db.addChangeListener(changeCallback);

  return changeCallback;
}

function getRetryCount(retryState: RetryState | undefined): number | undefined {
  return retryState?.type !== 'offline' ? retryState?.retryCount : undefined;
}

function getRetryIntervalMs(
  retryState: RetryState | undefined
): number | undefined {
  return retryState?.type === 'waiting-for-timeout' ||
    retryState?.type === 'updating'
    ? retryState?.retryIntervalMs
    : undefined;
}
