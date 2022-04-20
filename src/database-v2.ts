import jsonEqualish from '@birchill/json-equalish';

import { AbortError } from './abort-error';
import {
  allDataSeries,
  allMajorDataSeries,
  DataSeries,
  MajorDataSeries,
} from './data-series';
import { DataSeriesState } from './data-series-state';
import { DataVersion } from './data-version';
import { hasLanguage } from './download-v2';
import { JpdictStore } from './store-v2';
import { UpdateAction, reducer as updateReducer } from './update-state-reducer';
import { UpdateState } from './update-state-v2';
import { update } from './update-v2';

const MAJOR_VERSION: { [series in DataSeries]: number } = {
  kanji: 4,
  radicals: 4,
  names: 3,
  words: 2,
};

export type ChangeTopic = 'stateupdated' | 'deleted';
export type ChangeCallback = (topic: ChangeTopic) => void;

type DataSeriesInfo = {
  state: DataSeriesState;
  version: DataVersion | null;
  updateState: UpdateState;
};

type InProgressUpdate = {
  promise: Promise<void>;
  controller: AbortController;
  lang: string;
};

export class JpdictIdb {
  kanji: DataSeriesInfo = {
    state: 'init',
    version: null,
    updateState: { type: 'idle', lastCheck: null },
  };
  radicals: DataSeriesInfo = {
    state: 'init',
    version: null,
    updateState: { type: 'idle', lastCheck: null },
  };
  names: DataSeriesInfo = {
    state: 'init',
    version: null,
    updateState: { type: 'idle', lastCheck: null },
  };
  words: DataSeriesInfo = {
    state: 'init',
    version: null,
    updateState: { type: 'idle', lastCheck: null },
  };

  // This is currently only public so we can stub it in unit tests
  store: JpdictStore;

  private verbose = false;
  private readyPromise: Promise<any>;
  private changeListeners: ChangeCallback[] = [];
  private inProgressUpdates: {
    [series in MajorDataSeries]: InProgressUpdate | undefined;
  } = { words: undefined, kanji: undefined, names: undefined };

  // -------------------------------------------------------------------------
  //
  // Initialization
  //
  // -------------------------------------------------------------------------

  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    this.store = new JpdictStore();
    this.verbose = verbose;

    // Fetch initial state
    this.readyPromise = (async () => {
      try {
        for (const series of allDataSeries) {
          // (2022-04-20 w/ TS 4.6.3) The following cast is needed to convince
          // TS that `store` has been initialized.
          //
          // See https://stackoverflow.com/questions/51675833/typescript-error-property-is-used-before-being-assigned
          const dataVersion = await (this as this).store.getDataVersion(series);
          this.updateDataVersion(series, dataVersion);
        }
      } catch (e) {
        console.error('Failed to open IndexedDB');
        console.error(e);

        // Reset state and version information
        for (const series of allDataSeries) {
          this[series] = {
            ...this[series],
            state: 'unavailable',
            version: null,
          };
        }

        throw e;
      } finally {
        this.notifyChanged('stateupdated');
      }
    })();
  }

  get ready() {
    return this.readyPromise;
  }

  // -------------------------------------------------------------------------
  //
  // Destruction
  //
  // -------------------------------------------------------------------------

  async destroy() {
    try {
      await this.ready;
    } catch {
      // Ignore, we're going to destroy anyway
    }

    const hasData = allDataSeries.some(
      (key: DataSeries) => this[key].state !== 'unavailable'
    );
    if (hasData) {
      await this.store.destroy();
    }

    const hasInProgressUpdate = allMajorDataSeries.some(
      (s) => typeof this.inProgressUpdates[s] !== 'undefined'
    );
    if (this.verbose && hasInProgressUpdate) {
      console.info('Destroying database while there is an in-progress update');
    }

    this.store = new JpdictStore();
    for (const series of allDataSeries) {
      this[series] = {
        state: 'empty',
        version: null,
        updateState: { type: 'idle', lastCheck: null },
      };
    }
    this.notifyChanged('deleted');
  }

  async deleteSeries(series: MajorDataSeries) {
    if (this.inProgressUpdates[series]) {
      this.cancelUpdate(series);
    }

    await this.store.clearSeries(series);
    this.updateDataVersion(series, null);

    if (series === 'kanji') {
      await this.store.clearSeries('radicals');
      this.updateDataVersion('radicals', null);
    }
  }

  // -------------------------------------------------------------------------
  //
  // Change listeners
  //
  // -------------------------------------------------------------------------

  addChangeListener(callback: ChangeCallback) {
    if (this.changeListeners.indexOf(callback) !== -1) {
      return;
    }
    this.changeListeners.push(callback);
  }

  removeChangeListener(callback: ChangeCallback) {
    const index = this.changeListeners.indexOf(callback);
    if (index === -1) {
      return;
    }
    this.changeListeners.splice(index, 1);
  }

  private notifyChanged(topic: ChangeTopic) {
    const changeListeners = this.changeListeners.slice();
    for (const callback of changeListeners) {
      callback(topic);
    }
  }

  // -------------------------------------------------------------------------
  //
  // Updating
  //
  // -------------------------------------------------------------------------

  async update({ series, lang }: { series: MajorDataSeries; lang: string }) {
    // Check for an existing update
    const existingUpdate = this.inProgressUpdates[series];
    if (existingUpdate && existingUpdate.lang === lang) {
      if (this.verbose) {
        console.info(
          `Detected overlapping update for '${series}' series. Re-using existing update.`
        );
      }

      return existingUpdate.promise;
    }

    // Cancel the existing update since the language doesn't match
    if (existingUpdate) {
      if (this.verbose) {
        console.info(
          `Cancelling existing update for '${series}' series since the requested language (${lang}) doesn't match that of the existing update(${existingUpdate.lang})`
        );
      }

      this.cancelUpdate(series);
    }

    const controller = new AbortController();
    const signal = controller.signal;
    const updatePromise = (async () => {
      await this.ready;

      if (signal.aborted) {
        throw new AbortError();
      }

      switch (series) {
        case 'words':
          await this.doUpdate({ series: 'words', signal, lang });
          break;

        case 'kanji':
          await this.doUpdate({ series: 'kanji', signal, lang });
          if (signal.aborted) {
            throw new AbortError();
          }
          await this.doUpdate({ series: 'radicals', signal, lang });
          break;

        case 'names':
          await this.doUpdate({ series: 'names', signal, lang });
          break;
      }

      if (signal.aborted) {
        throw new AbortError();
      }
    })();

    this.inProgressUpdates[series] = {
      lang,
      controller,
      promise: updatePromise
        .catch(() => {}) // Ignore errors from this Promise chain
        .finally(() => {
          // Reset the in-progress update but only if the language wasn't changed
          // (since we don't want to clobber a new request).
          if (
            this.inProgressUpdates[series] &&
            this.inProgressUpdates[series]!.lang === lang
          ) {
            this.inProgressUpdates[series] = undefined;
          }
          this.notifyChanged('stateupdated');
        }),
    };

    return updatePromise;
  }

  private async doUpdate({
    series,
    signal,
    lang: requestedLang,
  }: {
    series: DataSeries;
    signal: AbortSignal;
    lang: string;
  }) {
    let wroteSomething = false;

    const reducer = (action: UpdateAction) => {
      this[series].updateState = updateReducer(
        this[series].updateState,
        action
      );

      if (action.type === 'fileend') {
        wroteSomething = true;
        this.updateDataVersion(series, action.version);
      }

      if (action.type === 'parseerror' && this.verbose) {
        console.warn('Encountered parse error', action.message, action.record);
      }

      this.notifyChanged('stateupdated');
    };

    // Check if we have been canceled while waiting to become ready
    if (signal.aborted) {
      reducer({ type: 'error', checkDate: null });
      throw new AbortError();
    }

    const checkDate = new Date();

    try {
      reducer({ type: 'start', series });

      // Check if the requested language is available for this series, and
      // fallback to English if not.
      const lang =
        requestedLang !== 'en' &&
        (await hasLanguage({
          series,
          lang: requestedLang,
          majorVersion: MAJOR_VERSION[series],
          signal,
        }))
          ? requestedLang
          : 'en';

      // If the language we have stored (if any) differs from the language we
      // are about to update to, clobber the existing data for this series.
      const currentLang: string | undefined =
        this[series].state === 'ok' ? this[series].version?.lang : undefined;
      if (currentLang && currentLang !== lang) {
        if (this.verbose) {
          console.info(
            `Clobbering '${series}' data to change lang to '${lang}'`
          );
        }
        await this.store.clearSeries(series);
        this.updateDataVersion(series, null);
      }

      if (signal.aborted) {
        throw new AbortError();
      }

      if (this.verbose) {
        console.info(
          `Requesting download for '${series}' series with current version ${JSON.stringify(
            this[series].version || undefined
          )}`
        );
      }

      await update({
        callback: reducer,
        currentVersion: this[series].version || undefined,
        lang,
        majorVersion: MAJOR_VERSION[series],
        signal,
        series,
        store: this.store,
      });

      if (signal.aborted) {
        throw new AbortError();
      }

      reducer({ type: 'end', checkDate });
    } catch (e) {
      // We should only update the last-check date if we actually made some
      // sort of update.
      reducer({
        type: 'error',
        checkDate: wroteSomething ? checkDate : null,
      });
      throw e;
    }
  }

  private updateDataVersion(series: DataSeries, version: DataVersion | null) {
    if (
      this[series].state !== 'init' &&
      this[series].state !== 'unavailable' &&
      jsonEqualish(this[series].version, version)
    ) {
      return;
    }

    this[series].version = version;
    this[series].state = version ? 'ok' : 'empty';

    this.notifyChanged('stateupdated');
  }

  cancelUpdate(series: MajorDataSeries): boolean {
    const inProgressUpdate = this.inProgressUpdates[series];
    if (!inProgressUpdate) {
      return false;
    }

    inProgressUpdate.controller.abort();

    return true;
  }
}
