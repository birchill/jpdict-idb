import {
  DBSchema,
  deleteDB,
  IDBPDatabase,
  IDBPTransaction,
  openDB,
  StoreNames,
} from 'idb/with-async-ittr';

import { DataSeries } from './data-series';
import { DataVersion } from './data-version';
import { DownloadDeleteRecord, DownloadRecord } from './download-types';
import { QuotaExceededError } from './quota-exceeded-error';
import {
  getStoreIdForKanjiRecord,
  getStoreIdForNameRecord,
  getStoreIdForRadicalRecord,
  getStoreIdForWordRecord,
  KanjiStoreRecord,
  NameStoreRecord,
  RadicalStoreRecord,
  toKanjiStoreRecord,
  toNameStoreRecord,
  toRadicalStoreRecord,
  toWordStoreRecord,
  WordStoreRecord,
} from './store-types';
import { stripFields } from './utils';

interface DataVersionRecord extends DataVersion {
  id: 1 | 2 | 3 | 4;
}

function getVersionKey(series: DataSeries): 1 | 2 | 3 | 4 {
  switch (series) {
    case 'words':
      return 4;

    case 'kanji':
      return 1;

    case 'radicals':
      return 2;

    case 'names':
      return 3;
  }
}

export interface JpdictSchema extends DBSchema {
  words: {
    key: number;
    value: WordStoreRecord;
    indexes: {
      k: Array<string>;
      r: Array<string>;
      h: Array<string>;
      kc: Array<string>;
      gt_en: Array<string>;
      gt_l: Array<string>;
    };
  };
  kanji: {
    key: number;
    value: KanjiStoreRecord;
    indexes: {
      'r.on': Array<string>;
      'r.kun': Array<string>;
      'r.na': Array<string>;
    };
  };
  radicals: {
    key: string;
    value: RadicalStoreRecord;
    indexes: {
      r: number;
      b: string;
      k: string;
    };
  };
  names: {
    key: number;
    value: NameStoreRecord;
    indexes: {
      k: Array<string>;
      r: Array<string>;
      h: Array<string>;
    };
  };
  version: {
    key: number;
    value: DataVersionRecord;
  };
}

export type RecordUpdate<T extends DataSeries> =
  | {
      mode: 'add';
      record: DownloadRecord<T>;
    }
  | {
      mode: 'change';
      record: DownloadRecord<T>;
    }
  | {
      mode: 'delete';
      record: DownloadDeleteRecord<T>;
    };

export class JpdictStore {
  private state: 'idle' | 'opening' | 'open' | 'error' | 'deleting' = 'idle';
  private db: IDBPDatabase<JpdictSchema> | undefined;
  private openPromise: Promise<IDBPDatabase<JpdictSchema>> | undefined;
  private deletePromise: Promise<void> | undefined;

  protected toStoreRecord: {
    [series in DataSeries]: (
      record: DownloadRecord<series>
    ) => JpdictSchema[series]['value'];
  } = {
    words: toWordStoreRecord,
    names: toNameStoreRecord,
    kanji: toKanjiStoreRecord,
    radicals: toRadicalStoreRecord,
  };

  protected getStoreId: {
    [series in DataSeries]: (
      record: DownloadDeleteRecord<series>
    ) => JpdictSchema[series]['key'];
  } = {
    words: getStoreIdForWordRecord,
    names: getStoreIdForNameRecord,
    kanji: getStoreIdForKanjiRecord,
    radicals: getStoreIdForRadicalRecord,
  };

  async open(): Promise<IDBPDatabase<JpdictSchema>> {
    if (this.state === 'open') {
      return this.db!;
    }

    if (this.state === 'opening') {
      return this.openPromise!;
    }

    if (this.state === 'deleting') {
      await this.deletePromise!;
    }

    this.state = 'opening';

    /* eslint @typescript-eslint/no-this-alias: 0 */
    const self = this;

    this.openPromise = openDB<JpdictSchema>('jpdict', 4, {
      upgrade(
        db: IDBPDatabase<JpdictSchema>,
        oldVersion: number,
        _newVersion: number | null,
        transaction: IDBPTransaction<
          JpdictSchema,
          StoreNames<JpdictSchema>[],
          'versionchange'
        >
      ) {
        if (oldVersion < 1) {
          const kanjiTable = db.createObjectStore<'kanji'>('kanji', {
            keyPath: 'c',
          });
          kanjiTable.createIndex('r.on', 'r.on', { multiEntry: true });
          kanjiTable.createIndex('r.kun', 'r.kun', { multiEntry: true });
          kanjiTable.createIndex('r.na', 'r.na', { multiEntry: true });

          const radicalsTable = db.createObjectStore<'radicals'>('radicals', {
            keyPath: 'id',
          });
          radicalsTable.createIndex('r', 'r');
          radicalsTable.createIndex('b', 'b');
          radicalsTable.createIndex('k', 'k');

          db.createObjectStore<'version'>('version', {
            keyPath: 'id',
          });
        }
        if (oldVersion < 2) {
          const namesTable = db.createObjectStore<'names'>('names', {
            keyPath: 'id',
          });
          namesTable.createIndex('k', 'k', { multiEntry: true });
          namesTable.createIndex('r', 'r', { multiEntry: true });
        }
        if (oldVersion < 3) {
          const namesTable = transaction.objectStore('names');
          namesTable.createIndex('h', 'h', { multiEntry: true });
        }
        if (oldVersion < 4) {
          const wordsTable = db.createObjectStore<'words'>('words', {
            keyPath: 'id',
          });
          wordsTable.createIndex('k', 'k', { multiEntry: true });
          wordsTable.createIndex('r', 'r', { multiEntry: true });

          wordsTable.createIndex('h', 'h', { multiEntry: true });

          wordsTable.createIndex('kc', 'kc', { multiEntry: true });
          wordsTable.createIndex('gt_en', 'gt_en', { multiEntry: true });
          wordsTable.createIndex('gt_l', 'gt_l', { multiEntry: true });
        }
      },
      blocked() {
        console.log('Opening blocked');
      },
      blocking() {
        if (self.db) {
          try {
            self.db.close();
          } catch {
            // Ignore
          }
          self.db = undefined;
          self.state = 'idle';
        }
      },
    }).then((db) => {
      self.db = db;
      self.state = 'open';
      return db;
    });

    try {
      await this.openPromise;
    } catch (e) {
      this.state = 'error';
      throw e;
    } finally {
      // This is not strictly necessary, but it doesn't hurt.
      this.openPromise = undefined;
    }

    // IndexedDB doesn't provide a way to check if a database exists
    // so we just unconditionally try to delete the old database, in case it
    // exists, _every_ _single_ _time_.
    //
    // We don't bother waiting on it or reporting errors, however.
    deleteDB('KanjiStore').catch(() => {});

    return this.db!;
  }

  async close() {
    if (this.state === 'idle') {
      return;
    }

    if (this.state === 'deleting') {
      return this.deletePromise;
    }

    if (this.state === 'opening') {
      await this.openPromise;
    }

    this.db?.close();
    this.db = undefined;
    this.state = 'idle';
  }

  async destroy() {
    if (this.state !== 'idle') {
      await this.close();
    }

    this.state = 'deleting';

    this.deletePromise = deleteDB('jpdict', {
      blocked() {
        console.log('Deletion blocked');
      },
    });

    await this.deletePromise;

    this.deletePromise = undefined;
    this.state = 'idle';
  }

  async clearSeries(series: DataSeries) {
    const db = await this.open();

    const tx = db.transaction([series, 'version'], 'readwrite');

    try {
      // Drop the table
      const targetTable = tx.objectStore(series);
      await targetTable.clear();

      // Drop the version record
      const versionTable = tx.objectStore('version');
      const id = getVersionKey(series);
      void versionTable.delete(id);
    } catch (e) {
      console.error(`Error deleting data series '${series}'`, e);

      // Ignore the abort from the transaction
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch {
        // Ignore exceptions from aborting the transaction.
        // This can happen is the transaction has already been aborted by this
        // point.
      }

      throw e;
    }

    await tx.done;
  }

  async getDataVersion(series: DataSeries): Promise<DataVersion | null> {
    await this.open();

    const key = getVersionKey(series);
    const versionDoc = await this.db!.get('version', key);
    if (!versionDoc) {
      return null;
    }

    return stripFields(versionDoc, ['id']);
  }

  async updateDataVersion({
    series,
    version,
  }: {
    series: DataSeries;
    version: DataVersion;
  }) {
    await this.open();

    try {
      const id = getVersionKey(series);
      await this.db!.put('version', { ...version, id });
    } catch (e) {
      console.error(
        `Error updating version of '${series}' to ${JSON.stringify(version)}`,
        e
      );

      throw e;
    }
  }

  async updateSeries<T extends DataSeries>({
    series,
    updates,
  }: {
    series: T;
    updates: Array<RecordUpdate<T>>;
  }) {
    await this.open();

    const tx = this.db!.transaction(series, 'readwrite', {
      durability: 'relaxed',
    });
    const table = tx.store;

    try {
      // The important thing here is NOT to wait on the result of each
      // put/delete. This speeds up the operation by an order of magnitude or
      // two and is Dexie's secret sauce.
      //
      // See: https://jsfiddle.net/birtles/vx4urLkw/17/
      for (const update of updates) {
        if (update.mode === 'delete') {
          void table.delete(this.getStoreId[series](update.record));
        } else {
          void table.put(this.toStoreRecord[series](update.record));
        }
      }

      await tx.done;
    } catch (e) {
      console.error(`Error updating series ${series}`, e);

      // Ignore the abort from the transaction
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch (_) {
        // As above, ignore exceptions from aborting the transaction.
      }

      // We sometimes encounter a situation where Firefox throws an Error with
      // an undefined message. All we have to go by is a user's screenshot that
      // shows the following in the browser console:
      //
      //   Error: undefined
      //
      // We _think_ this happens in some cases where the disk space quota is
      // exceeded so we try to detect that case and throw an actual
      // QuotaExceededError instead.
      if (isVeryGenericError(e) && (await atOrNearQuota())) {
        console.info(
          'Detected generic error masking a quota exceeded situation'
        );
        throw new QuotaExceededError();
      }

      throw e;
    }
  }

  // Test API
  async _getKanji(kanji: Array<number>): Promise<Array<KanjiStoreRecord>> {
    await this.open();

    const result: Array<KanjiStoreRecord> = [];
    {
      const tx = this.db!.transaction('kanji');
      for (const c of kanji) {
        const record = await tx.store.get(c);
        if (record) {
          result.push(record);
        }
      }
    }

    return result;
  }
}

// We occasionally get these obscure errors when running IndexedDB in an
// extension context where the error returned serializes as simply:
//
//   Error: undefined
//
// Our current theory is that it occurs when we hit an out-of-quota situation.
function isVeryGenericError(e: any): boolean {
  if (typeof e === 'undefined') {
    return true;
  }

  // Look for an Error without a name or an object with name 'Error' but no
  // message
  return (
    (e instanceof Error && !e?.name) || (e?.name === 'Error' && !e?.message)
  );
}

async function atOrNearQuota(): Promise<boolean> {
  try {
    const estimate = await self.navigator.storage.estimate();
    return (
      typeof estimate.usage !== 'undefined' &&
      typeof estimate.quota !== 'undefined' &&
      estimate.usage / estimate.quota > 0.9
    );
  } catch (_e) {
    return false;
  }
}
