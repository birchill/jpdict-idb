import { kanaToHiragana } from '@birchill/normal-jp';

import {
  KanjiDownloadDeleteRecord,
  KanjiDownloadRecord,
  LooselyCheckedReadingMeta,
  NameDownloadDeleteRecord,
  NameDownloadRecord,
  RadicalDownloadDeleteRecord,
  RadicalDownloadRecord,
  WordDownloadDeleteRecord,
  WordDownloadRecord,
} from './download-types';
import { hasHiragana } from './japanese';
import { Overwrite } from './type-helpers';
import { KanjiMeta } from './words';

// ----------------------------------------------------------------------------
//
// Words
//
// ----------------------------------------------------------------------------

export type WordStoreRecord = Overwrite<
  WordDownloadRecord,
  {
    // When transporting via JSON we replace nulls with 0s but we store them as
    // nulls.
    rm?: Array<null | LooselyCheckedReadingMeta>;
    km?: Array<null | KanjiMeta>;

    // r and k strings with all kana converted to hiragana
    h: Array<string>;
    // Individual from k split out into separate strings
    kc: Array<string>;
    // Gloss tokens (English and localized)
    gt_en: Array<string>;
    gt_l: Array<string>;
  }
>;

export function toWordStoreRecord(record: WordDownloadRecord): WordStoreRecord {
  const result = {
    ...record,
    rm: record.rm
      ? record.rm.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    km: record.km
      ? record.km.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    h: keysToHiragana([...(record.k || []), ...record.r]),
    kc: [],
    gt_en: [],
    gt_l: [],
  };

  // I'm not sure if IndexedDB preserves properties with undefined values
  // (I think it does, although JSON does not) but just to be sure we don't
  // end up storing unnecessary values, drop any undefined properties we may
  // have just added.
  if (!result.rm) {
    delete result.rm;
  }
  if (!result.km) {
    delete result.km;
  }

  return result;
}

export function getStoreIdForWordRecord(
  record: WordDownloadRecord | WordDownloadDeleteRecord
): number {
  return record.id;
}

// ----------------------------------------------------------------------------
//
// Names
//
// ----------------------------------------------------------------------------

export type NameStoreRecord = NameDownloadRecord & {
  // r and k strings with all kana converted to hiragana
  h: Array<string>;
};

export function toNameStoreRecord(entry: NameDownloadRecord): NameStoreRecord {
  return {
    ...entry,
    h: keysToHiragana([...(entry.k || []), ...entry.r]),
  };
}

export function getStoreIdForNameRecord(
  record: NameDownloadRecord | NameDownloadDeleteRecord
): number {
  return record.id;
}

// ----------------------------------------------------------------------------
//
// Kanji
//
// ----------------------------------------------------------------------------

export type KanjiStoreRecord = Overwrite<
  KanjiDownloadRecord,
  {
    // Define a variant on KanjiEntryLine that turns 'c' into a number
    c: number;
  }
>;

export function toKanjiStoreRecord(
  record: KanjiDownloadRecord
): KanjiStoreRecord {
  return {
    ...record,
    c: record.c.codePointAt(0) as number,
  };
}

export function getStoreIdForKanjiRecord(
  record: KanjiDownloadRecord | KanjiDownloadDeleteRecord
): number {
  return record.c.codePointAt(0) as number;
}

// ----------------------------------------------------------------------------
//
// Radicals
//
// ----------------------------------------------------------------------------

export type RadicalStoreRecord = RadicalDownloadRecord;

export function toRadicalStoreRecord(
  record: RadicalDownloadRecord
): RadicalStoreRecord {
  return record;
}

export function getStoreIdForRadicalRecord(
  record: RadicalDownloadRecord | RadicalDownloadDeleteRecord
): string {
  return record.id;
}

// ---------------------------------------------------------------------------
//
// Common
//
// ---------------------------------------------------------------------------

function keysToHiragana(values: Array<string>): Array<string> {
  // We only add hiragana keys for words that actually have some hiragana in
  // them. Any purely kanji keys should match on the 'k' index and won't benefit
  // from converting the input and source to hiragana so we can match them.
  return Array.from(
    new Set(values.map((value) => kanaToHiragana(value)).filter(hasHiragana))
  );
}
