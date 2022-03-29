export type DataSeries = 'words' | 'kanji' | 'radicals' | 'names';

export const allDataSeries: ReadonlyArray<DataSeries> = [
  'words',
  'kanji',
  'radicals',
  'names',
];

export function isDataSeries(a: unknown): a is DataSeries {
  return typeof a === 'string' && allDataSeries.includes(a as DataSeries);
}

// For certain interface actions we lump kanji and radicals together.
// e.g. If you want to update the kanji data set, you need to update the
// radicals too since we cross-reference the two.
export type MajorDataSeries = 'words' | 'kanji' | 'names';

export const allMajorDataSeries: ReadonlyArray<MajorDataSeries> = [
  'words',
  'kanji',
  'names',
];

export function isMajorDataSeries(a: unknown): a is MajorDataSeries {
  return (
    typeof a === 'string' && allMajorDataSeries.includes(a as MajorDataSeries)
  );
}
