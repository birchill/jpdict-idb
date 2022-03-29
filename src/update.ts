import { DataSeries } from './data-series';
import { DataVersion } from './data-version';
import { DownloadEvent } from './download';
import { KanjiEntryLine, KanjiDeletionLine } from './kanji';
import { RadicalEntryLine, RadicalDeletionLine } from './radicals';
import { NameEntryLine, NameDeletionLine } from './names';
import { KanjiRecord, RadicalRecord, NameRecord, WordRecord } from './records';
import { JpdictStore } from './store';
import { UpdateAction } from './update-actions';
import { stripFields } from './utils';
import { WordEntryLine, WordDeletionLine } from './words';

export type UpdateCallback = (action: UpdateAction) => void;

// Since IDB transactions are not tied to Promises properly yet and we can't
// keep a transaction alive while waiting on a stream we are basically forced to
// either:
//
// a) Abandon using transactions and live with the performance penalty of
//    doing so and the possibility of the DB being in an inconsistent state
//    (e.g. saying it is update-to-date with version X but actually having
//    part of version X+1 applied).
//
//    The latter is particularly bad when it comes to full updates since we
//    could delete everything and then only partially apply the new update
//    leaving us with an incomplete database.
//
// b) Abandon using transactions and create a parallel copy of the databases
//    and swap them in when done, thus avoiding at least the possibility of
//    being in an inconsistent state.
//
//    Unfortunately this is basically impossible to do with IndexedDB.
//    IndexedDB 2.0 allows renaming tables but only during version update so
//    we'd have to update the schema every time we do a full update even if the
//    update is only a data update.
//
// c) Accumulate all the data in memory first and then use regular
//    transactions to apply it.
//
// Considering that by not waiting for the success result of push actions bulk
// putting can be really fast, (c) is very attractive.
//
// (See https://jsfiddle.net/birtles/vx4urLkw/16/ for a rough benchmark.)
//
// However, we plan to use this in situations where we are downloading other
// dictionaries in parallel. In that case we'd rather not accumulate all the
// data for multiple dictionaries in memory at once. Ideally we'd like to batch
// changes for full updates, write them to a temporary database, then swap it in
// at the last moment but as described in (b) above that's really awkward with
// IndexedDB. So, for now, we just have to recommend only updating once database
// at a time to limit memory usage.

export async function updateWords(
  options: UpdateOptions<WordEntryLine, WordDeletionLine>
) {
  return update<WordEntryLine, WordDeletionLine, WordRecord, number>({
    ...options,
    series: 'words',
    toRecord: options.store.toWordRecord,
    getId: options.store.getIdForWordRecord,
  });
}

export async function updateKanji(
  options: UpdateOptions<KanjiEntryLine, KanjiDeletionLine>
) {
  return update<KanjiEntryLine, KanjiDeletionLine, KanjiRecord, number>({
    ...options,
    series: 'kanji',
    toRecord: options.store.toKanjiRecord,
    getId: options.store.getIdForKanjiRecord,
  });
}

export async function updateRadicals(
  options: UpdateOptions<RadicalEntryLine, RadicalDeletionLine>
) {
  return update<RadicalEntryLine, RadicalDeletionLine, RadicalRecord, string>({
    ...options,
    series: 'radicals',
    toRecord: options.store.toRadicalRecord,
    getId: options.store.getIdForRadicalRecord,
  });
}

export async function updateNames(
  options: UpdateOptions<NameEntryLine, NameDeletionLine>
) {
  return update<NameEntryLine, NameDeletionLine, NameRecord, number>({
    ...options,
    series: 'names',
    toRecord: options.store.toNameRecord,
    getId: options.store.getIdForNameRecord,
  });
}

export interface UpdateOptions<EntryLine, DeletionLine> {
  downloadIterator: AsyncIterableIterator<
    DownloadEvent<EntryLine, DeletionLine>
  >;
  lang: string;
  store: JpdictStore;
  callback: UpdateCallback;
  verbose?: boolean;
}

async function update<
  EntryLine extends Omit<object, 'type'>,
  DeletionLine,
  RecordType extends WordRecord | KanjiRecord | RadicalRecord | NameRecord,
  IdType extends number | string
>({
  downloadIterator,
  store,
  lang,
  series,
  toRecord,
  getId,
  callback,
  verbose = false,
}: {
  downloadIterator: AsyncIterableIterator<
    DownloadEvent<EntryLine, DeletionLine>
  >;
  store: JpdictStore;
  lang: string;
  series: DataSeries;
  toRecord: (e: EntryLine) => RecordType;
  getId: (e: DeletionLine) => IdType;
  callback: UpdateCallback;
  verbose?: boolean;
}) {
  let recordsToPut: Array<RecordType> = [];
  let recordsToDelete: Array<IdType> = [];

  let currentVersion: DataVersion | undefined;

  const finishCurrentVersion = async () => {
    if (!currentVersion) {
      return;
    }

    callback({ type: 'finishdownload', version: currentVersion });

    try {
      const onProgress = ({
        processed,
        total,
      }: {
        processed: number;
        total: number;
      }) => {
        callback({ type: 'progress', loaded: processed, total });
      };

      await store.bulkUpdateTable({
        table: series,
        put: recordsToPut,
        drop: currentVersion.patch === 0 ? '*' : recordsToDelete,
        version: currentVersion,
        onProgress,
      });
    } catch (e) {
      if (verbose) {
        console.log('Got error while updating tables');
        console.log(e);
        console.log(JSON.stringify(currentVersion));
      }
      throw e;
    }

    if (verbose) {
      console.log('Successfully updated tables');
      console.log(JSON.stringify(currentVersion));
    }

    recordsToPut = [];
    recordsToDelete = [];

    const appliedVersion = currentVersion;

    currentVersion = undefined;

    callback({ type: 'finishpatch', version: appliedVersion });
  };

  for await (const event of downloadIterator) {
    switch (event.type) {
      case 'version':
        if (currentVersion) {
          throw new Error(
            `Unfinished version: ${JSON.stringify(currentVersion)}`
          );
        }

        currentVersion = { ...stripFields(event, ['type']), lang };

        callback({
          type: 'startdownload',
          series,
          version: currentVersion,
        });
        break;

      case 'versionend':
        await finishCurrentVersion();
        break;

      case 'entry':
        {
          // The following hack is here until I work out how to fix this
          // properly:
          //
          //   https://stackoverflow.com/questions/57815891/how-to-define-an-object-type-that-does-not-include-a-specific-member
          //
          const recordToPut = toRecord(
            stripFields(event, ['type']) as unknown as EntryLine
          );
          recordsToPut.push(recordToPut);
        }
        break;

      case 'deletion':
        recordsToDelete.push(getId(event));
        break;

      case 'progress':
        callback(event);
        break;
    }
  }
}
