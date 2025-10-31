import type { DataSeries } from './data-series.js';
import type { JpdictIdb } from './database.js';
import { uuid } from './uuid.js';

const dbToUuid: Map<JpdictIdb, string> = new Map();

export function getUpdateKey(obj: JpdictIdb, series: DataSeries): string {
  if (!dbToUuid.has(obj)) {
    dbToUuid.set(obj, uuid());
  }
  const baseId = dbToUuid.get(obj);

  return `${baseId}-${series}`;
}
