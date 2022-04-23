import {
  IDBPDatabase,
  IDBPTransaction,
  openDB,
  StoreNames,
} from 'idb/with-async-ittr';
import idbReady from 'safari-14-idb-fix';
import { kanaToHiragana } from '@birchill/normal-jp';

import { JpdictSchema } from './store';
import {
  KanjiStoreRecord,
  NameStoreRecord,
  RadicalStoreRecord,
  WordStoreRecord,
} from './store-types';
import { getTokens } from './tokenizer';
import { stripFields } from './utils';
import {
  MatchMode,
  toWordResult,
  toWordResultFromGlossLookup,
} from './to-word-result';
import {
  getPriority,
  sortResultsByPriority,
  sortResultsByPriorityAndMatchLength,
} from './word-result-sorting';
import { CrossReference } from './words';
import {
  KanjiResult,
  NameResult,
  RelatedKanji,
  WordResult,
} from './result-types';

// Database query methods
//
// This is in a separate file so that we can include just the query methods
// in a separate worker / context and tree-shake out the rest of the module.
//
// Furthermore, these methods are careful not to read from the version table
// since that can block when the database is being updated. Instead, these
// methods are intended to be run on a separate thread to where the database
// update methods are being run so that it is still possible for the user to
// user the database while it is being updated.

// -------------------------------------------------------------------------
//
// Opening
//
// -------------------------------------------------------------------------

let _state: 'idle' | 'opening' | 'open' = 'idle';
let _db: IDBPDatabase<JpdictSchema> | undefined;
let _openPromise: Promise<IDBPDatabase<JpdictSchema> | null> | undefined;

function open(): Promise<IDBPDatabase<JpdictSchema> | null> {
  if (_state === 'open') {
    return Promise.resolve(_db!);
  }

  if (_state === 'opening') {
    return _openPromise!;
  }

  _state = 'opening';

  _openPromise = idbReady().then(() =>
    openDB<JpdictSchema>('jpdict', 4, {
      upgrade(
        _db: IDBPDatabase<JpdictSchema>,
        _oldVersion: number,
        _newVersion: number | null,
        transaction: IDBPTransaction<
          JpdictSchema,
          StoreNames<JpdictSchema>[],
          'versionchange'
        >
      ) {
        // If the database does not exist, do not try to create it.
        // If it is for an old version, do not try to use it.
        transaction.abort();
      },
      blocked() {
        console.log('Opening blocked');
      },
      blocking() {
        if (_db) {
          _db.close();
          _db = undefined;
          _state = 'idle';
        }
      },
      terminated() {
        _db = undefined;
        _state = 'idle';
      },
    })
      .then((db) => {
        _db = db;
        _state = 'open';
        return db;
      })
      .catch(() => {
        _state = 'idle';
        _db = undefined;
        return null;
      })
      .finally(() => {
        _openPromise = undefined;
      })
  );

  return _openPromise!;
}

// -------------------------------------------------------------------------
//
// Words
//
// -------------------------------------------------------------------------

export type MatchType = 'exact' | 'startsWith';

export async function getWords(
  search: string,
  options?: { matchType?: MatchType; limit: number }
): Promise<Array<WordResult>> {
  const db = await open();
  if (!db) {
    return [];
  }

  // Resolve match type and limit
  const matchType = options?.matchType ?? 'exact';
  const limit = options?.limit ?? Infinity;

  // Normalize search string
  const lookup = search.normalize();

  // Set up our output value.
  const addedRecords: Set<number> = new Set();
  const results: Array<WordResult> = [];

  const maybeAddRecord = (
    record: WordStoreRecord,
    term: string,
    kanaMatching: 'exact' | 'kana-equivalent' = 'exact'
  ) => {
    if (addedRecords.has(record.id)) {
      return;
    }

    let matchMode: MatchMode;
    if (matchType === 'exact') {
      matchMode =
        kanaMatching === 'exact'
          ? MatchMode.Lexeme
          : MatchMode.KanaEquivalentLexeme;
    } else {
      matchMode =
        kanaMatching === 'exact'
          ? MatchMode.StartsWithLexeme
          : MatchMode.StartsWithKanaEquivalentLexeme;
    }
    results.push(toWordResult(record, term, matchMode));
    addedRecords.add(record.id);
  };

  // Try the k (kanji) index first
  const kanjiIndex = db!.transaction('words').store.index('k');
  // (We explicitly use IDBKeyRange.only because otherwise the idb TS typings
  // fail to recognize that these indices are multi-entry and hence it is
  // valid to supply a single string instead of an array of strings.)
  const key =
    matchType === 'exact'
      ? IDBKeyRange.only(lookup)
      : IDBKeyRange.bound(lookup, lookup + '\uFFFF');
  for await (const cursor of kanjiIndex.iterate(key)) {
    maybeAddRecord(cursor.value, lookup);
  }

  // Then the r (reading) index
  const readingIndex = db!.transaction('words').store.index('r');
  for await (const cursor of readingIndex.iterate(key)) {
    maybeAddRecord(cursor.value, lookup);
  }

  // Then finally try converting to hiragana and using the hiragana index
  {
    const hiraganaIndex = db!.transaction('words').store.index('h');
    const hiragana = kanaToHiragana(lookup);
    const hiraganaKey =
      matchType === 'exact'
        ? IDBKeyRange.only(hiragana)
        : IDBKeyRange.bound(hiragana, hiragana + '\uFFFF');
    for await (const cursor of hiraganaIndex.iterate(hiraganaKey)) {
      maybeAddRecord(cursor.value, hiragana, 'kana-equivalent');
    }
  }

  // Sort using the following arrangement:
  //
  // A) For exact searching, sorting by priority is enough.
  //
  // B) For prefix ("starts with") searching, we want to make sure exact
  //    matches sort first so we penalize matches where the matched string
  //    is longer than the search term.
  //
  let sortedResult: Array<WordResult>;
  if (matchType === 'exact') {
    sortedResult = sortResultsByPriority(results);
  } else {
    sortedResult = sortResultsByPriorityAndMatchLength(results, lookup.length);
  }

  if (limit) {
    sortedResult.splice(limit);
  }

  return sortedResult;
}

export async function getWordsByCrossReference(
  xref: CrossReference
): Promise<Array<WordResult>> {
  const db = await open();
  if (!db) {
    return [];
  }

  // Normalize input
  const k = (xref as any).k?.normalize();
  const r = (xref as any).r?.normalize();

  // Set up our output value.
  const results: Array<WordResult> = [];

  // Matches with a kanji key
  if (k) {
    const kanjiIndex = db!.transaction('words').store.index('k');
    const key = IDBKeyRange.only(k);
    for await (const cursor of kanjiIndex.iterate(key)) {
      if (r && !cursor.value.r.includes(r)) {
        continue;
      }
      results.push(toWordResult(cursor.value, xref, MatchMode.Lexeme));
    }
  } else {
    const readingIndex = db!.transaction('words').store.index('r');
    const key = IDBKeyRange.only(r);
    for await (const cursor of readingIndex.iterate(key)) {
      results.push(toWordResult(cursor.value, xref, MatchMode.Lexeme));
    }
  }

  return sortResultsByPriority(results);
}

export async function getWordsWithKanji(
  search: string
): Promise<Array<WordResult>> {
  const db = await open();
  if (!db) {
    return [];
  }

  // Check input. In future we may allow specifying a series of kanji and
  // only returning words with all the kanji present, but we don't yet need
  // that so for now just check we have a single character.
  if ([...search].length !== 1) {
    throw new Error(`Search string should be a single character: ${search}`);
  }

  // Normalize search string
  const lookup = search.normalize();

  // Set up our output value.
  const results: Array<WordResult> = [];

  const kanjiComponentIndex = db!.transaction('words').store.index('kc');
  for await (const cursor of kanjiComponentIndex.iterate(
    IDBKeyRange.only(lookup)
  )) {
    results.push(toWordResult(cursor.value, lookup, MatchMode.Kanji));
  }

  return sortResultsByPriority(results);
}

type GlossSearchResultMeta = {
  // A value between 1 and 10.5 for how much of the gloss matched.
  confidence: number;

  // A number between 0 and 67 representing the priority of the result.
  priority: number;

  // Was this a match on a localized gloss, as opposed to falling back to an
  // English gloss? We weight localized results more highly.
  localizedMatch: boolean;
};

type MatchedRange = [sense: number, gloss: number, start: number, end: number];

// This currently only does substring phrase matching.
//
// Unlike a document search where you might want the search phrase
// `twinkling eye` to match "in the twinkling of an eye", when you're looking up
// a dictionary, you're typically more interested in finding an exact phrase.
// So, for the example above, you might search for "twinkling of" and expect it
// to match.
//
// Furthermore, since we are running locally, we can query as the user types
// and so we should be able to return suggestions just for "twink" etc.
// If we only return one result (or one particularly popular result?) an app
// could even offer auto-complete in that case.
//
// We have the caller pass in the language since otherwise we would have to
// look up the database version record which could cause us to block if the
// database is being updated.
export async function getWordsWithGloss(
  search: string,
  lang: string,
  limit?: number
): Promise<Array<WordResult>> {
  const db = await open();
  if (!db) {
    return [];
  }

  // Fetch at least 50 initial candidates. For common words we need at least
  // 40 or 50 or else we'll possibly fail to include the best entries.
  const numGlossCandidates = Math.max(limit || 0, 50);

  // Set up our output value.
  const resultMeta: Map<number, GlossSearchResultMeta> = new Map();
  const results: Array<WordResult> = [];

  // First search using the specified locale (if not English).
  if (lang !== 'en') {
    const records = await lookUpGlosses(db, search, lang, numGlossCandidates);
    for (const [record, confidence, matchedRanges] of records) {
      const result = toWordResultFromGlossLookup(record, matchedRanges);
      const priority = getPriority(result);

      results.push(result);
      resultMeta.set(record.id, {
        confidence,
        priority,
        localizedMatch: true,
      });
    }
  }

  // Look up English fallback glosses
  //
  // We do this even if we have enough candidates in results since the search
  // might be on an English term.
  {
    const records = await lookUpGlosses(db, search, 'en', numGlossCandidates);
    for (const [record, confidence, matchedRanges] of records) {
      // If we already added this record as a localized match, skip it.
      if (lang !== 'en' && resultMeta.has(record.id)) {
        continue;
      }

      const result = toWordResultFromGlossLookup(record, matchedRanges);
      const priority = getPriority(result);

      results.push(result);
      resultMeta.set(record.id, {
        confidence,
        priority,
        localizedMatch: false,
      });
    }
  }

  // Sort using the following scoring:
  //
  // * Confidence value (value 0 to 10.5) scaled to a value from 0~105
  // * Priority value in the range 0~67
  // * Localized vs English fallback: +50 for a localized result
  //
  const recordScore = (id: number): number => {
    const meta = resultMeta.get(id)!;
    return (
      meta.confidence * 10 + meta.priority + (meta.localizedMatch ? 50 : 0)
    );
  };
  results.sort((a, b) => recordScore(b.id) - recordScore(a.id));

  // Limit the results to the requested limit
  const actualLimit = Math.max(limit || 0, 0) || 100;

  return results.slice(0, actualLimit);
}

async function lookUpGlosses(
  db: IDBPDatabase<JpdictSchema>,
  term: string,
  locale: string,
  limit: number
): Promise<
  Array<
    [
      record: WordStoreRecord,
      confidence: number,
      matchedRanges: Array<MatchedRange>
    ]
  >
> {
  // Get search tokens
  const tokens = getTokens(term.normalize(), locale);
  if (!tokens || !tokens.length) {
    return [];
  }

  // Prepare lowercase version of the term for later substring matching
  const termLower = term.toLocaleLowerCase(locale);

  // Prepare result
  const result: Array<[WordStoreRecord, number, Array<MatchedRange>]> = [];

  // Look for any records matching the first token in the appropriate index
  const indexName = locale === 'en' ? 'gt_en' : 'gt_l';
  const glossIndex = db!.transaction('words').store.index(indexName);
  let hasFullMatchOnFirstToken = false;
  for await (const cursor of glossIndex.iterate(
    // Prefix match on first token
    IDBKeyRange.bound(tokens[0], tokens[0] + '\uFFFF')
  )) {
    const record = cursor.value;

    // If we have multiple tokens and completely match the first token, we
    // should not add any substring matches on that token.
    //
    // e.g. if we search on "stand up" and get a match on "stand" we should not
    // add any results that match on "standard" etc. (but we should add such
    // results if our search term was "stand" or "stan" or "standa" etc.).
    const fullMatchOnFirstToken =
      tokens.length > 1 && record[indexName].includes(tokens[0]);
    if (!fullMatchOnFirstToken && hasFullMatchOnFirstToken) {
      break;
    }
    hasFullMatchOnFirstToken = fullMatchOnFirstToken;

    // Check if the record has a sense which a substring match on the original
    // search term.
    const matchedRanges: Array<MatchedRange> = [];
    let confidence = 0;
    for (const [senseIndex, sense] of record.s.entries()) {
      // We need to skip these here, rather than filtering records, in order
      // to maintain the original sense indices.
      if ((sense.lang || 'en') !== locale) {
        continue;
      }

      // Look for a substring match
      for (const [glossIndex, gloss] of sense.g.entries()) {
        const substringStart = gloss
          .toLocaleLowerCase(locale)
          .indexOf(termLower);
        if (substringStart !== -1) {
          matchedRanges.push([
            senseIndex,
            glossIndex,
            substringStart,
            substringStart + term.length,
          ]);

          // Calculate the confidence for this particular match as follows:
          //
          // 1) Percentage of string that matched converted to an integer
          //    between 1 and 10
          // 2) Extra 0.5 point if the start token of the search term and gloss
          //    match.
          const textConfidence = (term.length / gloss.length) * 10;
          const tokenConfidence =
            (tokens.length / getTokens(gloss, locale).length) * 10;
          let thisConfidence = Math.round(
            Math.max(textConfidence, tokenConfidence)
          );
          if (tokens[0] === record[indexName][0]) {
            thisConfidence += 0.5;
          }
          confidence = Math.max(confidence, thisConfidence);
        }
      }

      // Even if we found a match, we need to go through all senses because
      // there could be multiple matches.
    }

    if (matchedRanges.length) {
      result.push([record, confidence, matchedRanges]);
    }

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

// -------------------------------------------------------------------------
//
// Kanji
//
// -------------------------------------------------------------------------

export async function getKanji({
  kanji,
  lang,
  logWarningMessage = console.log,
}: {
  kanji: Array<string>;
  lang: string;
  logWarningMessage?: (msg: string) => void;
}): Promise<Array<KanjiResult>> {
  const ids = kanji.map((kanji) => kanji.codePointAt(0)!);
  const kanjiRecords: Array<KanjiStoreRecord> = await getKanjiById(ids);

  const radicalResults = await getRadicalForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
  });
  if (kanjiRecords.length !== radicalResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as radical blocks (${radicalResults.length})`
    );
  }

  const componentResults = await getComponentsForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
  });
  if (kanjiRecords.length !== componentResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as component arrays (${componentResults.length})`
    );
  }

  const relatedResults = await getRelatedKanji(kanjiRecords, lang);
  if (kanjiRecords.length !== relatedResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as related kanji arrays (${relatedResults.length})`
    );
  }

  // Zip the arrays together
  return kanjiRecords.map<KanjiResult>((record, i) =>
    stripFields(
      {
        ...record,
        c: String.fromCodePoint(record.c),
        m_lang: record.m_lang || lang,
        rad: radicalResults[i],
        comp: componentResults[i],
        cf: relatedResults[i],
      },
      ['var']
    )
  );
}

async function getKanjiById(
  ids: Array<number>
): Promise<Array<KanjiStoreRecord>> {
  const db = await open();
  if (!db) {
    return [];
  }

  const kanjiRecords: Array<KanjiStoreRecord> = [];
  {
    const tx = db!.transaction('kanji');
    for (const c of ids) {
      const record = await tx.store.get(c);
      if (record) {
        kanjiRecords.push(record);
      }
    }
  }

  return kanjiRecords;
}

async function getRadicalForKanji({
  kanjiRecords,
  lang,
  logWarningMessage,
}: {
  kanjiRecords: Array<KanjiStoreRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
}): Promise<Array<KanjiResult['rad']>> {
  const radicals = await getRadicals();

  return kanjiRecords.map((record) => {
    const variantId = getRadicalVariantId(record);
    const baseId = formatRadicalId(record.rad.x);

    const radicalVariant = radicals.get(variantId || baseId);
    let rad: KanjiResult['rad'];
    if (radicalVariant) {
      rad = {
        x: record.rad.x,
        b: radicalVariant.b,
        k: radicalVariant.k,
        na: radicalVariant.na,
        m: radicalVariant.m,
        m_lang: radicalVariant.m_lang || lang,
      };
      if (record.rad.nelson) {
        rad.nelson = record.rad.nelson;
      }
    } else {
      // The radical was not found. This should basically never happen.
      // But rather than crash fatally, just fill in some nonsense data
      // instead.
      logWarningMessage(`Failed to find radical: ${variantId || baseId}`);
      rad = {
        ...record.rad,
        // We generally maintain the invariant that either 'b' or 'k' is
        // filled in (or both for a base radical) so even though the TS
        // typings don't require it, we should provide one here.
        b: '�',
        na: [''],
        m: [''],
        m_lang: lang,
      };
    }

    // If this a variant, return the base radical information too
    if (variantId) {
      const baseRadical = radicals.get(baseId);
      if (baseRadical) {
        const { b, k, na, m, m_lang } = baseRadical;
        rad.base = { b, k, na, m, m_lang: m_lang || lang };
      }
    }

    return rad;
  });
}

function formatRadicalId(id: number): string {
  return id.toString().padStart(3, '0');
}

type RadicalVariantArray = Array<{ radical: number; id: string }>;

function parseVariants(record: KanjiStoreRecord): RadicalVariantArray {
  const variants: Array<{ radical: number; id: string }> = [];

  if (record.var) {
    for (const variantId of record.var) {
      const matches = variantId.match(/^(\d+)-/);
      if (matches) {
        const [, radical] = matches;
        variants.push({
          radical: parseInt(radical, 10),
          id: variantId,
        });
      }
    }
  }

  return variants;
}

function popVariantForRadical(
  radical: number,
  variants: RadicalVariantArray
): string | undefined {
  // Add special handling so that if we are searching for a variant for 74 (⽉)
  // but we find 130-2 (にくづき) we match that.
  const variantIndex = variants.findIndex(
    (a) => a.radical === radical || (radical === 74 && a.id === '130-2')
  );

  if (variantIndex === -1) {
    return undefined;
  }

  const id = variants[variantIndex].id;
  variants.splice(variantIndex, 1);

  return id;
}

function getRadicalVariantId(record: KanjiStoreRecord): string | undefined {
  const variants = parseVariants(record);
  const variant = variants.find((a) => a.radical === record.rad.x);
  return variant?.id;
}

// NOTE: This is NOT meant to be a generic romaji utility. It does NOT
// cover e.g. ファ or ジャ. It is very specifically for filling out component
// records that use a katakana character and handles exactly the range we use
// there to detect katakana (which excludes some katakana at the end of the
// Unicode katakana block like ヾ).
//
// It also doesn't differentiate between e.g. ア or ァ. In fact, it is only
// ever expected to cover ム and ユ but we've made it a little bit more generic
// simply because the kanji components data is expected to be frequently updated
// and it's completely possible that other katakana symbols might show up there
// in the future.
const katakanaToRoman: Array<[string, string]> = [
  ['ァ', 'a'],
  ['ア', 'a'],
  ['ィ', 'i'],
  ['イ', 'i'],
  ['ゥ', 'u'],
  ['ウ', 'u'],
  ['ェ', 'e'],
  ['エ', 'e'],
  ['ォ', 'o'],
  ['オ', 'o'],
  ['カ', 'ka'],
  ['ガ', 'ga'],
  ['キ', 'ki'],
  ['ギ', 'gi'],
  ['ク', 'ku'],
  ['グ', 'gu'],
  ['ケ', 'ke'],
  ['ゲ', 'ge'],
  ['コ', 'ko'],
  ['ゴ', 'go'],
  ['サ', 'sa'],
  ['ザ', 'za'],
  ['シ', 'shi'],
  ['ジ', 'ji'],
  ['ス', 'su'],
  ['ズ', 'zu'],
  ['セ', 'se'],
  ['ゼ', 'ze'],
  ['ソ', 'so'],
  ['ゾ', 'zo'],
  ['タ', 'ta'],
  ['ダ', 'da'],
  ['チ', 'chi'],
  ['ヂ', 'di'],
  ['ッ', 'tsu'],
  ['ツ', 'tsu'],
  ['ヅ', 'dzu'],
  ['テ', 'te'],
  ['デ', 'de'],
  ['ト', 'to'],
  ['ド', 'do'],
  ['ナ', 'na'],
  ['ニ', 'ni'],
  ['ヌ', 'nu'],
  ['ネ', 'ne'],
  ['ノ', 'no'],
  ['ハ', 'ha'],
  ['バ', 'ba'],
  ['パ', 'pa'],
  ['ヒ', 'hi'],
  ['ビ', 'bi'],
  ['ピ', 'pi'],
  ['フ', 'fu'],
  ['ブ', 'bu'],
  ['プ', 'pu'],
  ['ヘ', 'he'],
  ['ベ', 'be'],
  ['ペ', 'pe'],
  ['ホ', 'ho'],
  ['ボ', 'bo'],
  ['ポ', 'po'],
  ['マ', 'ma'],
  ['ミ', 'mi'],
  ['ム', 'mu'],
  ['メ', 'me'],
  ['モ', 'mo'],
  ['ャ', 'ya'],
  ['ヤ', 'ya'],
  ['ュ', 'yu'],
  ['ユ', 'yu'],
  ['ョ', 'yo'],
  ['ヨ', 'yo'],
  ['ラ', 'ra'],
  ['リ', 'ri'],
  ['ル', 'ru'],
  ['レ', 're'],
  ['ロ', 'ro'],
  ['ヮ', 'wa'],
  ['ワ', 'wa'],
  ['ヰ', 'wi'],
  ['ヱ', 'we'],
  ['ヲ', 'wo'],
  ['ン', 'n'],
  ['ヴ', 'vu'],
  ['ヵ', 'ka'],
  ['ヶ', 'ke'],
  ['ヷ', 'ga'],
  ['ヸ', 'vi'],
  ['ヹ', 've'],
  ['ヺ', 'vo'],
];

async function getComponentsForKanji({
  kanjiRecords,
  lang,
  logWarningMessage,
}: {
  kanjiRecords: Array<KanjiStoreRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
}): Promise<Array<KanjiResult['comp']>> {
  // Collect all the characters together
  const components = kanjiRecords.reduce<Array<string>>(
    (components, record) =>
      components.concat(record.comp ? [...record.comp] : []),
    []
  );

  // Work out which kanji characters we need to lookup
  const radicalMap = await getCharToRadicalMapping();
  const kanjiToLookup = new Set<number>();
  for (const c of components) {
    if (c && !radicalMap.has(c)) {
      kanjiToLookup.add(c.codePointAt(0)!);
    }
  }

  // ... And look them up
  let kanjiMap: Map<string, KanjiStoreRecord> = new Map();
  if (kanjiToLookup.size) {
    const kanjiRecords = await getKanjiById([...kanjiToLookup]);
    kanjiMap = new Map(
      kanjiRecords.map((record) => [String.fromCodePoint(record.c), record])
    );
  }

  // Now fill out the information
  const radicals = await getRadicals();
  const result: Array<KanjiResult['comp']> = [];
  for (const record of kanjiRecords) {
    const comp: KanjiResult['comp'] = [];
    const variants = parseVariants(record);

    for (const c of record.comp ? [...record.comp] : []) {
      if (radicalMap.has(c)) {
        let radicalRecord = radicals.get(radicalMap.get(c)!);
        if (radicalRecord) {
          // Look for a matching variant
          const variantId = popVariantForRadical(radicalRecord!.r, variants);
          if (typeof variantId !== 'undefined') {
            const variantRadical = radicals.get(variantId);
            if (variantRadical) {
              radicalRecord = variantRadical;
            } else {
              logWarningMessage(
                `Couldn't find radical record for variant ${variantId}`
              );
            }
          }

          const component: KanjiResult['comp'][0] = {
            c,
            na: radicalRecord.na,
            m: radicalRecord.m,
            m_lang: radicalRecord.m_lang || lang,
          };
          const baseRadical = radicals.get(formatRadicalId(radicalRecord.r));
          if (baseRadical && baseRadical.k) {
            component.k = baseRadical.k;
          }

          comp.push(component);
        } else {
          logWarningMessage(`Couldn't find radical record for ${c}`);
        }
      } else if (kanjiMap.has(c)) {
        const kanjiRecord = kanjiMap.get(c);
        if (kanjiRecord) {
          let na: Array<string> = [];
          if (kanjiRecord.r.kun && kanjiRecord.r.kun.length) {
            na = kanjiRecord.r.kun.map((reading) => reading.replace('.', ''));
          } else if (kanjiRecord.r.on && kanjiRecord.r.on.length) {
            na = kanjiRecord.r.on;
          }

          comp.push({
            c,
            na,
            m: kanjiRecord.m,
            m_lang: kanjiRecord.m_lang || lang,
          });
        }
      } else if (c.codePointAt(0)! >= 0x30a1 && c.codePointAt(0)! <= 0x30fa) {
        // NOTE: If we ever support languages that are not roman-based, or
        // where it doesn't make sense to convert katakana into a roman
        // equivalent we should detect that here.
        //
        // For now we handle Japanese simply because that seems likely.
        if (lang === 'ja') {
          comp.push({
            c,
            na: [c],
            m: [`片仮名の${c}`],
            m_lang: lang,
          });
        } else {
          const asRoman = katakanaToRoman[c.codePointAt(0)! - 0x30a1][1];
          // NOTE: We only currently deal with a very limited number of
          // languages where it seems legitimate to write 片仮名 as
          // "katakana" (as best I can tell).
          //
          // Once we come to handle languages like Korean and so on we'll
          // actually want to localize this properly.
          //
          // e.g.
          //
          //   Korean: 카타카나
          //   Chinese (what kind?): 片假名
          //   Arabic: الكاتاكانا ?
          //   Persian: काताकाना ?
          //   Russian: Ката́кана ?
          //
          // Given that all these languages fall back to English anyway,
          // though, it's probably not so bad if we forget to do this.
          //
          // TODO: Update this when we handle word dictionary
          if (!['en', 'es', 'pt', 'fr'].includes(lang)) {
            logWarningMessage(
              `Generating katakana record for unknown language: ${lang}`
            );
          }
          comp.push({
            c,
            na: [c],
            m: [`katakana ${asRoman}`],
            m_lang: lang,
          });
        }
      } else {
        logWarningMessage(`Couldn't find a radical or kanji entry for ${c}`);
      }
    }

    result.push(comp);
  }

  return result;
}

async function getRelatedKanji(
  kanjiRecords: Array<KanjiStoreRecord>,
  lang: string
): Promise<Array<Array<RelatedKanji>>> {
  // Collect all the characters together
  const cf = kanjiRecords.reduce<Array<number>>(
    (cf, record) =>
      cf.concat(
        record.cf ? [...record.cf].map((c) => c.codePointAt(0) || 0) : []
      ),
    []
  );
  const kanjiToLookup = new Set<number>(cf);

  // ... And look them up
  let kanjiMap: Map<string, KanjiStoreRecord> = new Map();
  if (kanjiToLookup.size) {
    const kanjiRecords = await getKanjiById([...kanjiToLookup]);
    kanjiMap = new Map(
      kanjiRecords.map((record) => [String.fromCodePoint(record.c), record])
    );
  }

  // Now fill out the information
  const result: Array<Array<RelatedKanji>> = [];
  for (const record of kanjiRecords) {
    const relatedKanji: Array<RelatedKanji> = [];
    for (const cfChar of record.cf ? [...record.cf] : []) {
      const kanji = kanjiMap.get(cfChar);
      if (!kanji) {
        continue;
      }

      const { r, m, m_lang, misc } = kanji;
      relatedKanji.push({ c: cfChar, r, m, m_lang: m_lang || lang, misc });
    }
    result.push(relatedKanji);
  }

  return result;
}

async function getRadicals(): Promise<Map<string, RadicalStoreRecord>> {
  const db = await open();
  if (!db) {
    return new Map();
  }

  return db
    .getAll('radicals')
    .then((records) => new Map(records.map((record) => [record.id, record])));
}

async function getCharToRadicalMapping(): Promise<Map<string, string>> {
  const radicals = await getRadicals();

  let baseRadical: RadicalStoreRecord | undefined;
  const mapping: Map<string, string> = new Map();

  for (const radical of radicals.values()) {
    if (radical.id.indexOf('-') === -1) {
      baseRadical = radical;
      if (radical.b) {
        mapping.set(radical.b, radical.id);
      }
      if (radical.k) {
        mapping.set(radical.k, radical.id);
      }
    } else {
      if (!baseRadical) {
        throw new Error('Radicals out of order--no base radical found');
      }
      if (radical.r !== baseRadical.r) {
        throw new Error('Radicals out of order--ID mismatch');
      }
      // Skip 130-2. This one is special. It's にくづき which has the same
      // unicode codepoint as つき but we don't want to clobber that record
      // (which we'll end up doing because they have different base radicals).
      //
      // Instead, we'll take care to pick up variants like this in
      // getComponentsForKanji (or more specifically popVariantForRadical).
      if (radical.id === '130-2') {
        continue;
      }
      if (radical.b && radical.b !== baseRadical.b) {
        mapping.set(radical.b, radical.id);
      }
      if (radical.k && radical.k !== baseRadical.k) {
        mapping.set(radical.k, radical.id);
      }
    }
  }

  return mapping;
}

// -------------------------------------------------------------------------
//
// Names
//
// -------------------------------------------------------------------------

export async function getNames(search: string): Promise<Array<NameResult>> {
  const db = await open();
  if (!db) {
    return [];
  }

  // Normalize search string
  const lookup = search.normalize();

  // Set up our output value.
  const addedRecords: Set<number> = new Set();
  const result: Array<NameResult> = [];

  const maybeAddRecord = (record: NameStoreRecord) => {
    if (!addedRecords.has(record.id)) {
      result.push(stripFields(record, ['h']));
      addedRecords.add(record.id);
    }
  };

  // Try the k (kanji) index first
  const kanjiIndex = db!.transaction('names').store.index('k');
  // (We explicitly use IDBKeyRange.only because otherwise the idb TS typings
  // fail to recognize that these indices are multi-entry and hence it is
  // valid to supply a single string instead of an array of strings.)
  for await (const cursor of kanjiIndex.iterate(IDBKeyRange.only(lookup))) {
    maybeAddRecord(cursor.value);
  }

  // Then the r (reading) index
  const readingIndex = db!.transaction('names').store.index('r');
  for await (const cursor of readingIndex.iterate(IDBKeyRange.only(lookup))) {
    maybeAddRecord(cursor.value);
  }

  // Then finally try converting to hiragana and using the hiragana index
  const hiraganaIndex = db!.transaction('names').store.index('h');
  const hiragana = kanaToHiragana(lookup);
  for await (const cursor of hiraganaIndex.iterate(
    IDBKeyRange.only(hiragana)
  )) {
    maybeAddRecord(cursor.value);
  }

  return result;
}
