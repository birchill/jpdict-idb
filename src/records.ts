import { kanaToHiragana } from '@birchill/normal-jp';

import { hasHiragana } from './japanese';
import { KanjiEntryLine, KanjiDeletionLine } from './kanji';
import { RadicalEntryLine, RadicalDeletionLine } from './radicals';
import { NameEntryLine, NameDeletionLine } from './names';
import {
  ReadingMeta,
  KanjiMeta,
  WordDeletionLine,
  WordEntryLine,
} from './words';

// ---------------------------------------------------------------------------
//
// Word records
//
// ---------------------------------------------------------------------------

export type WordRecord = Omit<WordEntryLine, 'km' | 'rm'> & {
  // When transporting via JSON we replace nulls with 0s but we should restore
  // them here.
  rm?: Array<null | ReadingMeta>;
  km?: Array<null | KanjiMeta>;

  // r and k strings with all kana converted to hiragana
  h: Array<string>;
  // Individual from k split out into separate strings
  kc: Array<string>;
  // Gloss tokens (English and localized)
  gt_en: Array<string>;
  gt_l: Array<string>;
};

export function toWordRecord(entry: WordEntryLine): WordRecord {
  const result = {
    ...entry,
    rm: entry.rm
      ? entry.rm.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    km: entry.km
      ? entry.km.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    h: keysToHiragana([...(entry.k || []), ...entry.r]),
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

export function getIdForWordRecord(entry: WordDeletionLine): number {
  return entry.id;
}

// ---------------------------------------------------------------------------
//
// Kanji records
//
// ---------------------------------------------------------------------------

// Define a variant on KanjiEntryLine that turns 'c' into a number
export interface KanjiRecord extends Omit<KanjiEntryLine, 'c'> {
  c: number;
}

export function toKanjiRecord(entry: KanjiEntryLine): KanjiRecord {
  return {
    ...entry,
    c: entry.c.codePointAt(0) as number,
  };
}

export function getIdForKanjiRecord(entry: KanjiDeletionLine): number {
  return entry.c.codePointAt(0) as number;
}

export type RadicalRecord = RadicalEntryLine;

export function toRadicalRecord(entry: RadicalEntryLine): RadicalRecord {
  return entry;
}

export function getIdForRadicalRecord(entry: RadicalDeletionLine): string {
  return entry.id;
}

// ---------------------------------------------------------------------------
//
// Name records
//
// ---------------------------------------------------------------------------

export type NameRecord = NameEntryLine & {
  // r and k strings with all kana converted to hiragana
  h: Array<string>;
};

export function toNameRecord(entry: NameEntryLine): NameRecord {
  return {
    ...entry,
    h: keysToHiragana([...(entry.k || []), ...entry.r]),
  };
}

export function getIdForNameRecord(entry: NameDeletionLine): number {
  return entry.id;
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
