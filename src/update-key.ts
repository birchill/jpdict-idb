import { DataSeries } from './data-series';
import { JpdictIdb } from './database';
import { uuid } from './uuid';

const dbToUuid: Map<JpdictIdb, string> = new Map();

export function getUpdateKey(obj: JpdictIdb, series: DataSeries): string {
  if (!dbToUuid.has(obj)) {
    dbToUuid.set(obj, uuid());
  }
  const baseId = dbToUuid.get(obj);

  return `${baseId}-${series}`;
}
