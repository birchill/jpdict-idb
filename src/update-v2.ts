import { AbortError } from './abort-error';
import { DataSeries } from './data-series';
import { DataVersion } from './data-version';
import {
  validateDownloadDeleteRecord,
  validateDownloadRecord,
} from './download-types';
import { CurrentVersion, download, RecordEvent } from './download-v2';
import { JpdictStore, RecordUpdate } from './store-v2';
import { UpdateEvent } from './update-events';

export type UpdateCallback = (action: UpdateEvent) => void;

// The number of records to queue up before updating the store.
//
// For IndexedDB, bigger batches are faster since we can just wait on the
// transaction to complete rather than each individual put or delete and that
// tends to be dramatically faster.
//
// However, making the batches too big introduces janky progress because
// typically the download speed is faster than the update speed so we try to
// make sure the batches aren't _too_ big.
//
// (In case that doesn't make sense, suppose we use a batch size of 10,000.
// Often, downloading 10,000 records takes a fraction of a second while on many
// systems putting 10,000 records into IndexedDB takes a second or two. If we
// dispatch progress events based on the 'record' events we get from the
// download and then do a big database update we'll get a series of quick
// progress events and then a big pause while we update.
//
// We could try to dispatch progress events while we're updating too--in fact,
// we used to do just that--but it's simpler if we can just have one type of
// progress event and dispatch it fairly consistently.)
const BATCH_SIZE = 1000;

// Don't update the progress until it has changed by at least 2%.
const MAX_PROGRESS_RESOLUTION = 0.02;

export async function update({
  callback,
  currentVersion,
  lang,
  majorVersion,
  series,
  signal,
  store,
}: {
  callback: UpdateCallback;
  currentVersion?: CurrentVersion;
  lang: string;
  majorVersion: number;
  signal: AbortSignal;
  series: DataSeries;
  store: JpdictStore;
}): Promise<void> {
  return doUpdate({
    callback,
    currentVersion,
    lang,
    majorVersion,
    series,
    signal,
    store,
  });
}

async function doUpdate<Series extends DataSeries>({
  callback,
  currentVersion,
  lang,
  majorVersion,
  series,
  signal,
  store,
}: {
  callback: UpdateCallback;
  currentVersion?: CurrentVersion;
  lang: string;
  majorVersion: number;
  signal: AbortSignal;
  series: Series;
  store: JpdictStore;
}) {
  // Clear the database if the current version is empty in case we have records
  // lying around from an incomplete initial download.
  if (!currentVersion) {
    await store.clearSeries(series);
  }

  let currentFile = 0;
  let currentFileVersion: DataVersion | undefined;
  let totalFiles = 0;

  let currentRecord = 0;
  let totalRecords = 0;
  let updates: Array<RecordUpdate<Series>> = [];

  let lastReportedTotalProgress: number | undefined;

  for await (const event of download({
    series,
    majorVersion,
    currentVersion,
    lang,
    signal,
    forceFetch: true,
  })) {
    if (signal.aborted) {
      throw new AbortError();
    }

    switch (event.type) {
      case 'reset':
        await store.clearSeries(series);
        break;

      case 'downloadstart':
        totalFiles = event.files;
        callback({ type: 'updatestart', series });
        callback({
          type: 'progress',
          series,
          fileProgress: 0,
          totalProgress: 0,
        });
        break;

      case 'downloadend':
        callback({ type: 'updateend', series });
        break;

      case 'filestart':
        currentFile++;
        currentRecord = 0;
        totalRecords = event.totalRecords;
        currentFileVersion = event.version;
        callback({ type: 'filestart', series, version: event.version });
        break;

      case 'fileend':
        {
          // Save remaining batched items
          if (updates.length) {
            await store.updateSeries({ series, updates });
            updates = [];
          }

          // Commit version info
          //
          // XXX First we need to rework the part numbering to be 1-based.
          //
          // Then we can check if:
          //
          //   currentFileVersion.partInfo.part === currentFileVersion.partInfo.parts
          //
          // and drop the `partInfo`.
          await store.updateDataVersion({
            series,
            version: currentFileVersion!,
          });

          // Final progress event
          const totalProgress = currentFile / totalFiles;
          callback({
            type: 'progress',
            series,
            fileProgress: 1,
            totalProgress,
          });
          lastReportedTotalProgress = totalProgress;

          callback({ type: 'fileend', series });
        }
        break;

      case 'record':
        {
          const [error, update] = parseRecordEvent({ series, event });
          if (error) {
            callback({
              type: 'parseerror',
              series,
              message: error.message,
              record: event.record,
            });
          } else {
            updates.push(update);
            if (updates.length >= BATCH_SIZE) {
              await store.updateSeries({ series, updates });
              updates = [];
            }
          }

          // We update the total number of records even if we failed to validate
          // the incoming record because the progress should continue even if
          // all the records are bad.
          currentRecord++;

          // If we have processed enough records to pass the progress event
          // threshold, dispatch a progress event.
          const fileProgress = currentRecord / totalRecords;
          const totalProgress = (currentFile - 1 + fileProgress) / totalFiles;
          if (
            lastReportedTotalProgress === undefined ||
            totalProgress - lastReportedTotalProgress > MAX_PROGRESS_RESOLUTION
          ) {
            callback({ type: 'progress', series, fileProgress, totalProgress });
            lastReportedTotalProgress = totalProgress;
          }
        }
        break;
    }
  }
}

function parseRecordEvent<Series extends DataSeries>({
  series,
  event,
}: {
  series: Series;
  event: RecordEvent;
}): [Error, undefined] | [undefined, RecordUpdate<Series>] {
  const { mode, record: unvalidatedRecord } = event;
  if (mode === 'delete') {
    const [err, record] = validateDownloadDeleteRecord({
      series,
      record: unvalidatedRecord,
    });
    return err ? [err, undefined] : [undefined, { mode, record }];
  }

  const [err, record] = validateDownloadRecord({
    series,
    record: unvalidatedRecord,
  });
  return err ? [err, undefined] : [undefined, { mode, record }];
}
