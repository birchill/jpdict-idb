import { DataSeries, MajorDataSeries } from './data-series';
import { JpdictDatabase } from './database';
import { JpdictStore } from './store';
import { uuid } from './uuid';

const storeToUuid: Map<JpdictStore, string> = new Map();
const dbToUuid: Map<JpdictDatabase, string> = new Map();

export function getUpdateKey(
  obj: JpdictStore | JpdictDatabase,
  series: DataSeries | MajorDataSeries
): string {
  let baseId;

  if (obj instanceof JpdictStore) {
    if (!storeToUuid.has(obj)) {
      storeToUuid.set(obj, uuid());
    }
    baseId = storeToUuid.get(obj);
  } else {
    if (!dbToUuid.has(obj)) {
      dbToUuid.set(obj, uuid());
    }
    baseId = dbToUuid.get(obj);
  }

  return `${baseId}-${series}`;
}
