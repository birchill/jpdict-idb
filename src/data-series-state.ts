export type DataSeriesState =
  // We don't know yet if we have a database or not
  | 'init'
  // No data has been stored yet
  | 'empty'
  // We have data and it's usable
  | 'ok'
  // The database itself is somehow unavailable (e.g. IndexedDB has been
  // disabled or blocked due to user permissions or private mode browsing).
  | 'unavailable';
