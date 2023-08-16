import { kanaToHiragana } from '@birchill/normal-jp';

import {
  ExtendedKanaEntry,
  ExtendedKanjiEntry,
  ExtendedSense,
  Gloss,
  WordResult,
} from './result-types';
import { WordStoreRecord } from './store-types';
import { stripFields } from './utils';
import {
  BITS_PER_GLOSS_TYPE,
  CrossReference,
  GlossType,
  GlossTypes,
  KanjiMeta,
  ReadingMeta,
  WordRecord,
  WordSense,
} from './words';
import { partition } from './partition';

export type MatchMode =
  | 'lexeme'
  | 'kana-equivalent'
  | 'starts-with'
  | 'starts-with-kana-equivalent'
  | 'kanji';

export function toWordResult(
  record: WordStoreRecord,
  search: string | CrossReference,
  matchMode: MatchMode
): WordResult {
  let kanjiMatches,
    kanjiMatchRanges,
    kanaMatches,
    kanaMatchRanges,
    senseMatches;
  if (typeof search !== 'string') {
    [
      kanjiMatches,
      kanjiMatchRanges,
      kanaMatches,
      kanaMatchRanges,
      senseMatches,
    ] = getMatchMetadataForCrossRefLookup(record, search, matchMode);
  } else {
    [
      kanjiMatches,
      kanjiMatchRanges,
      kanaMatches,
      kanaMatchRanges,
      senseMatches,
    ] = getMatchMetadata(record, search, matchMode);
  }

  return makeWordResult(
    record,
    kanjiMatches,
    kanjiMatchRanges,
    kanaMatches,
    kanaMatchRanges,
    senseMatches,
    []
  );
}

type MatchedSenseAndGlossRange = [
  sense: number,
  gloss: number,
  start: number,
  end: number,
];

export function toWordResultFromGlossLookup(
  record: WordStoreRecord,
  matchedRanges: Array<MatchedSenseAndGlossRange>
): WordResult {
  const [kanjiMatches, kanaMatches, senseMatches] =
    getMatchMetadataForGlossLookup(record, matchedRanges);

  return makeWordResult(
    record,
    kanjiMatches,
    [],
    kanaMatches,
    [],
    senseMatches,
    matchedRanges
  );
}

// ---------------------------------------------------------------------------
//
// Helpers
//
// ---------------------------------------------------------------------------

type MatchedHeadwordRange = [index: number, start: number, end: number];

function makeWordResult(
  record: WordRecord,
  kanjiMatches: number,
  kanjiMatchRanges: Array<MatchedHeadwordRange>,
  kanaMatches: number,
  kanaMatchRanges: Array<MatchedHeadwordRange>,
  senseMatches: number,
  matchedGlossRanges: Array<MatchedSenseAndGlossRange>
) {
  return {
    id: record.id,
    k: mergeMeta(
      record.k,
      record.km,
      kanjiMatches,
      kanjiMatchRanges,
      (key, match, matchRange, meta) => {
        const result: ExtendedKanjiEntry = {
          ent: key,
          ...meta,
          match,
        };

        // WaniKani levels are stored in the `p` (priority) field for simplicity
        // in the form `wk{N}` where N is the level number.
        //
        // We need to extract any such levels and store them in the `wk` field.
        const [rawWks, p] = partition(meta?.p || [], (p) => /^wk\d+$/.test(p));
        const allWks = rawWks.map((p) => parseInt(p.slice(2), 10));
        const wk = allWks.length ? Math.min(...allWks) : undefined;

        if (p.length) {
          result.p = p;
        } else {
          delete result.p;
        }

        if (wk) {
          result.wk = wk;
        }

        if (matchRange) {
          result.matchRange = matchRange;
        }
        return result;
      }
    ),
    r: mergeMeta(
      record.r,
      record.rm,
      kanaMatches,
      kanaMatchRanges,
      (key, match, matchRange, meta) => {
        const result: ExtendedKanaEntry = {
          ent: key,
          ...meta,
          match,
        };
        if (matchRange) {
          result.matchRange = matchRange;
        }
        return result;
      }
    ),
    s: expandSenses(record.s, senseMatches, matchedGlossRanges),
  };
}

function getMatchMetadata(
  record: WordStoreRecord,
  search: string,
  matchMode: MatchMode
): [
  kanjiMatches: number,
  kanjiMatchRanges: Array<MatchedHeadwordRange>,
  kanaMatches: number,
  kanaMatchRanges: Array<MatchedHeadwordRange>,
  senseMatches: number,
] {
  // There are three cases:
  //
  // 1) We matched on a kanji entry
  //
  //    -- All k entries that exactly match `search` should match.
  //    -- All r entries that apply to the k entry should match.
  //       (i.e. no app field or one that matches).
  //    -- All s entries that:
  //       -- Have a kapp field, and it matches, should match.
  //       -- Have only a rapp field, and the corresponding r entry matches,
  //          should match.
  //       -- Have no kapp or rapp field should match.
  //
  // 2) We matched on a reading (kana) entry
  //
  //    -- All r entries that exactly match `search` should match.
  //    -- All k entries to which the matching r entries apply should match.
  //    -- All s entries that:
  //       -- Have a rapp field, and the corresponding r entry matches,
  //          should match.
  //       -- Have a kapp field, and the corresponding k entry matches,
  //          should match.
  //       -- Have no rapp or kapp field should match.
  //
  // 3) We matched on a hiragana index
  //
  //    -- As above trying (1) first then (2) using the hiragana-converted
  //       term.
  //
  // Because of (3), we just always search both arrays.

  // First build up a bitfield of all kanji matches.
  const matcher: (str: string) => boolean = (str) => {
    switch (matchMode) {
      case 'lexeme':
        return str === search;
      case 'kana-equivalent':
        return kanaToHiragana(str) === search;
      case 'starts-with':
        return str.startsWith(search);
      case 'starts-with-kana-equivalent':
        return kanaToHiragana(str).startsWith(search);
      case 'kanji':
        return [...str].includes(search);
    }
  };
  let kanjiMatches = arrayToBitfield(record.k || [], matcher);

  // Fill out any match information
  const kanjiMatchRanges: Array<MatchedHeadwordRange> = [];
  for (let i = 0; i < (record.k?.length || 0); i++) {
    if (kanjiMatches & (1 << i)) {
      switch (matchMode) {
        case 'lexeme':
        case 'kana-equivalent':
        case 'starts-with':
        case 'starts-with-kana-equivalent':
          kanjiMatchRanges.push([i, 0, search.length]);
          break;

        case 'kanji':
          {
            const index = [...record.k![i]].indexOf(search);
            kanjiMatchRanges.push([i, index, index + 1]);
          }
          break;
      }
    }
  }

  let kanaMatches = 0;
  let senseMatches = 0;
  const kanaMatchRanges: Array<MatchedHeadwordRange> = [];
  if (kanjiMatches) {
    // Case (1) from above: Find corresponding kana matches
    kanaMatches = kanaMatchesForKanji(record, kanjiMatches);
    senseMatches = arrayToBitfield(record.s, (sense) => {
      if (typeof sense.kapp !== 'undefined') {
        return !!(sense.kapp & kanjiMatches);
      } else if (typeof sense.rapp !== 'undefined') {
        return !!(sense.rapp & kanaMatches);
      } else {
        return true;
      }
    });
  } else if (
    matchMode === 'lexeme' ||
    matchMode === 'kana-equivalent' ||
    matchMode === 'starts-with' ||
    matchMode === 'starts-with-kana-equivalent'
  ) {
    // Case (2) from above: Find kana matches and the kanji they apply to.
    kanaMatches = arrayToBitfield(record.r, matcher);
    kanjiMatches = kanjiMatchesForKana(record, kanaMatches);

    senseMatches = arrayToBitfield(record.s, (sense) => {
      if (typeof sense.rapp !== 'undefined') {
        return !!(sense.rapp & kanaMatches);
      } else if (typeof sense.kapp !== 'undefined') {
        return !!(sense.kapp & kanjiMatches);
      } else {
        return true;
      }
    });

    // Fill out kana match range information
    for (let i = 0; i < record.r.length; i++) {
      if (kanaMatches & (1 << i)) {
        kanaMatchRanges.push([i, 0, search.length]);
        break;
      }
    }
  }

  return [
    kanjiMatches,
    kanjiMatchRanges,
    kanaMatches,
    kanaMatchRanges,
    senseMatches,
  ];
}

function getMatchMetadataForCrossRefLookup(
  record: WordStoreRecord,
  xref: CrossReference,
  matchMode: MatchMode
): [
  kanjiMatches: number,
  kanjiMatchRanges: Array<MatchedHeadwordRange>,
  kanaMatches: number,
  kanaMatchRanges: Array<MatchedHeadwordRange>,
  senseMatches: number,
] {
  let kanjiMatches = 0;
  let kanjiMatchRanges: Array<MatchedHeadwordRange> = [];
  let kanaMatches = 0;
  let kanaMatchRanges: Array<MatchedHeadwordRange> = [];
  let senseMatches = 0;

  const xRefK = (xref as any).k as string | undefined;
  const xRefR = (xref as any).r as string | undefined;

  if (xRefK && xRefR) {
    // Fill out kanji match information
    kanjiMatches = arrayToBitfield(record.k || [], (k) => k === xRefK);
    for (let i = 0; i < (record.k?.length || 0); i++) {
      if (kanjiMatches & (1 << i)) {
        kanjiMatchRanges.push([i, 0, xRefK.length]);
      }
    }

    // Fill out reading match information
    kanaMatches = arrayToBitfield(record.r, (r) => r === xRefR);
    for (let i = 0; i < record.r.length; i++) {
      if (kanaMatches & (1 << i)) {
        kanaMatchRanges.push([i, 0, xRefR.length]);
      }
    }

    // Fill out sense information, although we may end up overwriting this
    // below.
    senseMatches = arrayToBitfield(record.s, (sense) => {
      if (typeof sense.kapp !== 'undefined') {
        return !!(sense.kapp & kanjiMatches);
      } else if (typeof sense.rapp !== 'undefined') {
        return !!(sense.rapp & kanaMatches);
      } else {
        return true;
      }
    });
  } else {
    [
      kanjiMatches,
      kanjiMatchRanges,
      kanaMatches,
      kanaMatchRanges,
      senseMatches,
    ] = getMatchMetadata(record, (xRefK || xRefR)!, matchMode);
  }

  if (xref.sense) {
    senseMatches = 1 << (xref.sense - 1);
  }

  return [
    kanjiMatches,
    kanjiMatchRanges,
    kanaMatches,
    kanaMatchRanges,
    senseMatches,
  ];
}

function getMatchMetadataForGlossLookup(
  record: WordStoreRecord,
  matchedRanges: Array<MatchedSenseAndGlossRange>
): [kanjiMatches: number, kanaMatches: number, senseMatches: number] {
  const senseMatches = matchedRanges
    .map(([sense]) => sense)
    .reduce((value, senseIndex) => value | (1 << senseIndex), 0);

  // Work out which kanji and readings also match
  let kanjiMatches = 0;
  let kanaMatches = 0;

  const kanjiWildCard = (1 << (record.k || []).length) - 1;
  const kanaWildCard = (1 << (record.r || []).length) - 1;

  for (const [i, sense] of record.s.entries()) {
    if (!(senseMatches & (1 << i))) {
      continue;
    }

    if (
      typeof sense.kapp !== 'undefined' &&
      typeof sense.rapp !== 'undefined'
    ) {
      kanjiMatches |= sense.kapp;
      kanaMatches |= sense.rapp;
    } else if (typeof sense.kapp !== 'undefined') {
      kanjiMatches |= sense.kapp;
      kanaMatches |= kanaMatchesForKanji(record, kanjiMatches);
    } else if (typeof sense.rapp !== 'undefined') {
      kanaMatches |= sense.rapp;
      kanjiMatches = kanjiMatchesForKana(record, kanaMatches);
    } else {
      kanjiMatches = kanjiWildCard;
      kanaMatches = kanaWildCard;
      break;
    }
  }

  return [kanjiMatches, kanaMatches, senseMatches];
}

function kanaMatchesForKanji(
  record: WordStoreRecord,
  kanjiMatches: number
): number {
  const kanaIsMatch = (rm: ReadingMeta | null) =>
    !rm || typeof rm.app === 'undefined' || !!(rm.app & kanjiMatches);

  return arrayToBitfield(
    // We need to extend the rm array with nulls so that any readings without
    // meta fields are treated as applying to all kanji.
    extendWithNulls(record.rm || [], record.r.length),
    kanaIsMatch
  );
}

function extendWithNulls<T>(
  arr: Array<T | null>,
  len: number
): Array<T | null> {
  const extra = Math.max(len - arr.length, 0);
  return arr.concat(Array(extra).fill(null));
}

function kanjiMatchesForKana(
  record: WordStoreRecord,
  kanaMatches: number
): number {
  const wildCardMatch = (1 << (record.k || []).length) - 1;
  const matchingKanjiAtIndex = (i: number): number => {
    if (!record.rm || record.rm.length < i + 1 || record.rm[i] === null) {
      return wildCardMatch;
    }

    return record.rm[i]!.app ?? wildCardMatch;
  };

  let matches = 0;
  for (let i = 0; i < record.r.length; i++) {
    matches |= kanaMatches & (1 << i) ? matchingKanjiAtIndex(i) : 0;
  }
  return matches;
}

function arrayToBitfield<T>(arr: Array<T>, test: (elem: T) => boolean): number {
  return arr.reduce(
    (value, elem, i) => (test(elem) ? value | (1 << i) : value),
    0
  );
}

function mergeMeta<MetaType extends KanjiMeta | ReadingMeta, MergedType>(
  keys: Array<string> | undefined,
  metaArray: Array<null | MetaType> | undefined,
  matches: number,
  matchRanges: Array<MatchedHeadwordRange>,
  merge: (
    key: string,
    match: boolean,
    matchRange?: [start: number, end: number] | undefined,
    meta?: MetaType
  ) => MergedType
): Array<MergedType> {
  const result: Array<MergedType> = [];

  for (const [i, key] of (keys || []).entries()) {
    const match = !!(matches & (1 << i));
    const meta =
      metaArray && metaArray.length >= i + 1 && metaArray[i] !== null
        ? metaArray[i]!
        : undefined;
    const matchRange = matchRanges.find((item) => item[0] === i)?.slice(1) as
      | [number, number]
      | undefined;
    result.push(merge(key, match, matchRange, meta));
  }

  return result;
}

function expandSenses(
  senses: Array<WordSense>,
  senseMatches: number,
  matchedGlossRanges: Array<MatchedSenseAndGlossRange>
): Array<ExtendedSense> {
  const getRangesForSense = (i: number): Array<MatchedRangeForGloss> =>
    matchedGlossRanges
      .filter(([senseIndex]) => senseIndex === i)
      .map(([, gloss, start, end]) => [gloss, start, end]);

  return senses.map((sense, i) => ({
    g: expandGlosses(sense, getRangesForSense(i)),
    ...stripFields(sense, ['g', 'gt']),
    match: !!(senseMatches & (1 << i)),
  }));
}

type MatchedRangeForGloss = [gloss: number, start: number, end: number];

function expandGlosses(
  sense: WordSense,
  matchedRanges: Array<MatchedRangeForGloss>
): Array<Gloss> {
  // Helpers to work out the gloss type
  const gt = sense.gt || 0;
  const typeMask = (1 << BITS_PER_GLOSS_TYPE) - 1;
  const glossTypeAtIndex = (i: number): GlossType => {
    return GlossTypes[(gt >> (i * BITS_PER_GLOSS_TYPE)) & typeMask];
  };

  return sense.g.map((gloss, i) => {
    // This rather convoluted mess is because our test harness differentiates
    // between properties that are not set and those that are set to
    // undefined.
    const result: Gloss = { str: gloss };

    const type = glossTypeAtIndex(i);
    if (type !== 'none') {
      result.type = type;
    }

    let range: MatchedRangeForGloss | undefined;
    while (matchedRanges.length && matchedRanges[0][0] <= i) {
      range = matchedRanges.shift();
    }
    if (range) {
      result.matchRange = range.slice(1) as [number, number];
    }

    return result;
  });
}
