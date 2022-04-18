import { jsonEqualish } from '@birchill/json-equalish';

import { AbortError } from './abort-error';
import { allDataSeries, DataSeries, MajorDataSeries } from './data-series';
import { DataVersion } from './data-version';
import { download, hasLanguage } from './download';
import { isKanjiDeletionLine, isKanjiEntryLine } from './kanji';
import { isRadicalDeletionLine, isRadicalEntryLine } from './radicals';
import { isNameDeletionLine, isNameEntryLine } from './names';
import { JpdictStore } from './store';
import { UpdateAction } from './update-actions';
import { UpdateState } from './update-state';
import { reducer as updateReducer } from './update-reducer';
import {
  updateKanji,
  updateNames,
  UpdateOptions,
  updateRadicals,
  updateWords,
} from './update';
import { isWordDeletionLine, isWordEntryLine } from './words';

const MAJOR_VERSION: { [series in DataSeries]: number } = {
  kanji: 4,
  radicals: 4,
  names: 3,
  words: 2,
};

export const enum DataSeriesState {
  // We don't know yet if we have a database or not
  Initializing,
  // No data has been stored yet
  Empty,
  // We have data and it's usable
  Ok,
  // The database itself is somehow unavailable (e.g. IndexedDB has been
  // disabled or blocked due to user permissions or private mode browsing).
  Unavailable,
}

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

export class JpdictDatabase {
  kanji: DataSeriesInfo = {
    state: DataSeriesState.Initializing,
    version: null,
    updateState: { state: 'idle', lastCheck: null },
  };
  radicals: DataSeriesInfo = {
    state: DataSeriesState.Initializing,
    version: null,
    updateState: { state: 'idle', lastCheck: null },
  };
  names: DataSeriesInfo = {
    state: DataSeriesState.Initializing,
    version: null,
    updateState: { state: 'idle', lastCheck: null },
  };
  words: DataSeriesInfo = {
    state: DataSeriesState.Initializing,
    version: null,
    updateState: { state: 'idle', lastCheck: null },
  };

  store: JpdictStore;
  verbose = false;

  private readyPromise: Promise<any>;
  private inProgressUpdates: {
    [series in MajorDataSeries]: InProgressUpdate | undefined;
  } = { words: undefined, kanji: undefined, names: undefined };
  private changeListeners: ChangeCallback[] = [];

  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    this.store = new JpdictStore();
    this.verbose = verbose;

    // Fetch initial state
    this.readyPromise = (async () => {
      try {
        for (const series of allDataSeries) {
          const dataVersion = await this.store.getDataVersion(series);
          this.updateDataVersion(series, dataVersion);
        }
      } catch (e) {
        console.error('Failed to open IndexedDB');
        console.error(e);

        // Reset state and version information
        for (const series of allDataSeries) {
          this[series] = {
            ...this[series],
            state: DataSeriesState.Unavailable,
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
    const changeListeners = [...this.changeListeners];
    for (const callback of changeListeners) {
      callback(topic);
    }
  }

  private updateDataVersion(series: DataSeries, version: DataVersion | null) {
    if (
      this[series].state !== DataSeriesState.Initializing &&
      this[series].state !== DataSeriesState.Unavailable &&
      jsonEqualish(this[series].version, version)
    ) {
      return;
    }

    this[series].version = version;
    this[series].state = version ? DataSeriesState.Ok : DataSeriesState.Empty;

    this.notifyChanged('stateupdated');
  }

  async update({
    series,
    lang = 'en',
  }: {
    series: MajorDataSeries;
    lang?: string;
  }) {
    // Check for an existing update
    const existingUpdate = this.inProgressUpdates[series];
    if (existingUpdate && existingUpdate.lang === lang) {
      if (this.verbose) {
        console.log(
          `Detected overlapping update for ${series}. Re-using existing update.`
        );
      }

      return existingUpdate.promise;
    }

    // Cancel the existing update since the language doesn't match
    if (existingUpdate) {
      if (this.verbose) {
        console.log(
          `Cancelling existing update for ${series} since the requested language (${lang}) doesn't match that of the existing update(${existingUpdate.lang})`
        );
      }

      this.cancelUpdate({ series });
    }

    const controller = new AbortController();
    this.inProgressUpdates[series] = {
      lang,
      controller,
      promise: (async () => {
        try {
          await this.ready;

          if (controller.signal.aborted) {
            throw new AbortError();
          }

          switch (series) {
            case 'words':
              await this.doUpdate({
                series: 'words',
                lang,
                forceFetch: true,
                isEntryLine: isWordEntryLine,
                isDeletionLine: isWordDeletionLine,
                update: updateWords,
              });
              break;

            case 'kanji':
              await this.doUpdate({
                series: 'kanji',
                lang,
                forceFetch: true,
                isEntryLine: isKanjiEntryLine,
                isDeletionLine: isKanjiDeletionLine,
                update: updateKanji,
              });

              await this.doUpdate({
                series: 'radicals',
                lang,
                forceFetch: true,
                isEntryLine: isRadicalEntryLine,
                isDeletionLine: isRadicalDeletionLine,
                update: updateRadicals,
              });
              break;

            case 'names':
              await this.doUpdate({
                series: 'names',
                lang,
                forceFetch: true,
                isEntryLine: isNameEntryLine,
                isDeletionLine: isNameDeletionLine,
                update: updateNames,
              });
              break;
          }

          if (controller.signal.aborted) {
            throw new AbortError();
          }
        } finally {
          // Reset the in progress update but only if the language wasn't
          // changed (since we don't want to clobber the new request).
          if (
            this.inProgressUpdates[series] &&
            this.inProgressUpdates[series]!.lang === lang
          ) {
            this.inProgressUpdates[series] = undefined;
          }
          this.notifyChanged('stateupdated');
        }
      })(),
    };

    return this.inProgressUpdates[series]!.promise;
  }

  private async doUpdate<EntryLine, DeletionLine>({
    series,
    lang: requestedLang,
    forceFetch,
    isEntryLine,
    isDeletionLine,
    update,
  }: {
    series: DataSeries;
    lang: string;
    forceFetch: boolean;
    isEntryLine: (a: any) => a is EntryLine;
    isDeletionLine: (a: any) => a is DeletionLine;
    update: (options: UpdateOptions<EntryLine, DeletionLine>) => Promise<void>;
  }) {
    // Fetch the AbortSignal so we can check if we have been aborted even after
    // our InProgressUpdate is removed.
    const majorSeries: MajorDataSeries =
      series === 'radicals' ? 'kanji' : series;
    if (!this.inProgressUpdates[majorSeries]) {
      throw new AbortError();
    }
    const signal = this.inProgressUpdates[majorSeries]!.controller.signal;

    let wroteSomething = false;

    const reducer = (action: UpdateAction) => {
      this[series].updateState = updateReducer(
        this[series].updateState,
        action
      );
      if (action.type === 'finishpatch') {
        wroteSomething = true;
        this.updateDataVersion(series, action.version);
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
        this[series].state === DataSeriesState.Ok
          ? this[series].version!.lang
          : undefined;
      if (currentLang && currentLang !== lang) {
        if (this.verbose) {
          console.log(`Clobbering ${series} data to change lang to ${lang}`);
        }
        await this.store.clearTable(series);
        this.updateDataVersion(series, null);
      }

      if (signal.aborted) {
        throw new AbortError();
      }

      if (this.verbose) {
        console.log(
          `Requesting download for ${series} series with current version ${JSON.stringify(
            this[series].version || undefined
          )}`
        );
      }

      const downloadIterator = download({
        series,
        lang,
        majorVersion: MAJOR_VERSION[series],
        currentVersion: this[series].version || undefined,
        signal,
        forceFetch,
        isEntryLine,
        isDeletionLine,
      });

      if (signal.aborted) {
        throw new AbortError();
      }

      await update({
        downloadIterator,
        lang,
        store: this.store,
        callback: reducer,
        verbose: this.verbose,
      });

      if (signal.aborted) {
        throw new AbortError();
      }

      reducer({ type: 'finish', checkDate });
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

  cancelUpdate({ series }: { series: MajorDataSeries }): boolean {
    const inProgressUpdate = this.inProgressUpdates[series];
    if (!inProgressUpdate) {
      return false;
    }

    inProgressUpdate.controller.abort();

    return true;
  }

  async destroy() {
    try {
      await this.ready;
    } catch (e) {
      /* Ignore, we're going to destroy anyway */
    }

    const hasData = allDataSeries.some(
      (key: DataSeries) => this[key].state !== DataSeriesState.Unavailable
    );
    if (hasData) {
      await this.store.destroy();
    }

    const hasInProgressUpdate = Object.keys(this.inProgressUpdates).some(
      (key) =>
        typeof this.inProgressUpdates[key as MajorDataSeries] !== 'undefined'
    );
    if (this.verbose && hasInProgressUpdate) {
      console.log('Destroying database while there is an in-progress update');
    }

    this.store = new JpdictStore();
    for (const series of allDataSeries) {
      this[series] = {
        state: DataSeriesState.Empty,
        version: null,
        updateState: { state: 'idle', lastCheck: null },
      };
    }
    this.notifyChanged('deleted');
  }

  async deleteSeries(series: MajorDataSeries) {
    if (this.inProgressUpdates[series]) {
      this.cancelUpdate({ series });
    }

    await this.store.clearTable(series);
    this.updateDataVersion(series, null);

    if (series === 'kanji') {
      await this.store.clearTable('radicals');
      this.updateDataVersion('radicals', null);
    }
  }
}
