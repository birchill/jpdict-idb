import * as s from 'superstruct';

export const safeInteger = (): s.Struct<number, null> =>
  s.refine(s.integer(), 'safeInteger', (value) => Number.isSafeInteger(value));
