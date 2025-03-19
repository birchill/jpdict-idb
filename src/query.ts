import {
  parse as parseComponents,
  type Components,
  type RootComponent,
  type SubComponent,
} from '@birchill/kanji-component-string-utils';
import { kanaToHiragana } from '@birchill/normal-jp';
import { IDBPDatabase, IDBPTransaction, openDB, StoreNames } from 'idb';

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
import { getPriority, sortWordResults } from './word-result-sorting';
import { CrossReference } from './words';
import {
  KanjiComponentInfo,
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

  _openPromise = openDB<JpdictSchema>('jpdict', 4, {
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
    });

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
      matchMode = kanaMatching === 'exact' ? 'lexeme' : 'kana-equivalent';
    } else {
      matchMode =
        kanaMatching === 'exact'
          ? 'starts-with'
          : 'starts-with-kana-equivalent';
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
    sortedResult = sortWordResults(results);
  } else {
    sortedResult = sortWordResults(results, { searchLength: lookup.length });
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
      results.push(toWordResult(cursor.value, xref, 'lexeme'));
    }
  } else {
    const readingIndex = db!.transaction('words').store.index('r');
    const key = IDBKeyRange.only(r);
    for await (const cursor of readingIndex.iterate(key)) {
      results.push(toWordResult(cursor.value, xref, 'lexeme'));
    }
  }

  return sortWordResults(results);
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
    results.push(toWordResult(cursor.value, lookup, 'kanji'));
  }

  return sortWordResults(results);
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
      matchedRanges: Array<MatchedRange>,
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
  const radicalRecords = await getRadicals();

  const radicalResults = await getRadicalForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
    radicalRecords,
  });
  if (kanjiRecords.length !== radicalResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as radical records (${radicalResults.length})`
    );
  }

  const componentResults = await getComponentsForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
    radicalRecords,
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
  return kanjiRecords.map<KanjiResult>((record, i) => ({
    ...record,
    c: String.fromCodePoint(record.c),
    m_lang: record.m_lang || lang,
    rad: radicalResults[i],
    comp: componentResults[i],
    cf: relatedResults[i],
  }));
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
  radicalRecords,
}: {
  kanjiRecords: Array<KanjiStoreRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
  radicalRecords: Map<string, RadicalStoreRecord>;
}): Promise<Array<KanjiResult['rad']>> {
  return kanjiRecords.map((record) => {
    const radical = radicalRecords.get(formatRadicalId(record.rad.x));
    let rad: KanjiResult['rad'];
    if (radical) {
      rad = {
        x: {
          r: radical.r,
          c: (radical.b || radical.k)!,
          na: radical.na,
          m: radical.m,
          m_lang: radical.m_lang || lang,
        },
      };

      if (record.rad.nelson) {
        const nelson = radicalRecords.get(formatRadicalId(record.rad.nelson));
        if (nelson) {
          rad.nelson = {
            r: nelson.r,
            c: (nelson.b || nelson.k)!,
            na: nelson.na,
            m: nelson.m,
            m_lang: nelson.m_lang || lang,
          };
        }
      }
    } else {
      // The radical was not found. This should basically never happen.
      // But rather than crash fatally, just fill in some nonsense data
      // instead.
      logWarningMessage(`Failed to find radical: ${record.rad.x}`);
      rad = {
        x: {
          r: record.rad.x,
          c: '�',
          na: [''],
          m: [''],
          m_lang: lang,
        },
      };
    }

    return rad;
  });
}

function formatRadicalId(id: number): string {
  return id.toString().padStart(3, '0');
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
  radicalRecords,
}: {
  kanjiRecords: Array<KanjiStoreRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
  radicalRecords: Map<string, RadicalStoreRecord>;
}): Promise<Array<KanjiResult['comp']>> {
  const components = kanjiRecords.flatMap((record) =>
    record.comp ? parseComponents(record.comp) : []
  );

  // Work out which kanji characters we need to lookup
  const radicalMap = await getRadicalComponentInfo(radicalRecords, lang);
  const kanjiToLookup = new Set<number>();
  for (const {
    component: { c },
  } of iterateComponents(components)) {
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
  const result: Array<KanjiResult['comp']> = [];
  for (const record of kanjiRecords) {
    const comp: KanjiResult['comp'] = [];
    const components = parseComponents(record.comp || '');

    for (const component of components) {
      const compInfo:
        | (KanjiComponentInfo & { sub?: Array<KanjiComponentInfo> })
        | null = getComponentInfo({
        component,
        kanjiMap,
        kanjiRadical: record.rad,
        radicalMap,
        lang,
        logWarningMessage,
      });
      if (!compInfo) {
        continue;
      }

      if (component.sub?.length) {
        compInfo.sub = component.sub
          .map((sub) =>
            getComponentInfo({
              component: sub,
              kanjiMap,
              kanjiRadical: record.rad,
              radicalMap,
              lang,
              logWarningMessage,
            })
          )
          .filter((a): a is KanjiComponentInfo => !!a);
      }

      comp.push(compInfo);
    }

    result.push(comp);
  }

  return result;
}

function* iterateComponents(
  components: Components
): Generator<
  | { component: RootComponent; parent: null }
  | { component: SubComponent; parent: RootComponent }
> {
  for (const component of components) {
    yield { component, parent: null };
    for (const sub of component.sub || []) {
      yield { component: sub, parent: component };
    }
  }
}

function getComponentInfo({
  component: { c, var: variant },
  kanjiMap,
  kanjiRadical,
  radicalMap,
  lang,
  logWarningMessage,
}: {
  component: SubComponent;
  kanjiMap: Map<string, KanjiStoreRecord>;
  kanjiRadical: KanjiStoreRecord['rad'];
  radicalMap: Map<string, Array<RadicalComponentInfo>>;
  lang: string;
  logWarningMessage: (msg: string) => void;
}): KanjiComponentInfo | null {
  const matchingRadicals = radicalMap.get(c);
  if (matchingRadicals?.length) {
    let radical: RadicalComponentInfo | null = null;
    if (matchingRadicals.length === 1) {
      radical = matchingRadicals[0];
    } else if (matchingRadicals.length > 1) {
      const filtered = variant
        ? matchingRadicals.filter((radical) => radical.id === variant)
        : matchingRadicals.filter((radical) => radical.id.indexOf('-') === -1);

      if (filtered.length) {
        radical = filtered[0];
      } else {
        logWarningMessage(
          `Couldn't find radical record for variant ${variant}`
        );
      }
    }

    if (radical) {
      const result: KanjiComponentInfo = stripFields(radical, ['id', 'r']);
      if (kanjiRadical.x === radical.r) {
        result.is_rad = true;
      }
      return result;
    }
  }

  if (kanjiMap.has(c)) {
    const kanjiRecord = kanjiMap.get(c);
    if (kanjiRecord) {
      let na: Array<string> = [];
      if (kanjiRecord.r.kun && kanjiRecord.r.kun.length) {
        na = kanjiRecord.r.kun.map((reading) => reading.replace('.', ''));
      } else if (kanjiRecord.r.on && kanjiRecord.r.on.length) {
        na = kanjiRecord.r.on;
      }

      return {
        c,
        na,
        m: kanjiRecord.m,
        m_lang: kanjiRecord.m_lang || lang,
      };
    }
  }

  // Katakana components
  if (c.codePointAt(0)! >= 0x30a1 && c.codePointAt(0)! <= 0x30fa) {
    // NOTE: If we ever support languages that are not roman-based, or
    // where it doesn't make sense to convert katakana into a roman
    // equivalent we should detect that here.
    //
    // For now we handle Japanese simply because that seems likely.
    if (lang === 'ja') {
      return {
        c,
        na: [c],
        m: [`片仮名の${c}`],
        m_lang: lang,
      };
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
      return {
        c,
        na: [c],
        m: [`katakana ${asRoman}`],
        m_lang: lang,
      };
    }
  }

  logWarningMessage(`Couldn't find a radical or kanji entry for ${c}`);
  return null;
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

type RadicalComponentInfo = { id: string; r: number } & KanjiComponentInfo;

async function getRadicalComponentInfo(
  radicals: Map<string, RadicalStoreRecord>,
  lang: string
): Promise<Map<string, Array<RadicalComponentInfo>>> {
  const result = new Map<string, Array<RadicalComponentInfo>>();
  const baseRadicals = new Map<number, RadicalComponentInfo>();

  for (const record of radicals.values()) {
    const radicalData: RadicalComponentInfo = {
      id: record.id,
      r: record.r,
      c: (record.b || record.k)!,
      k: record.k,
      na: record.na,
      m: record.m,
      m_lang: record.m_lang || lang,
    };

    // If this is a variant, fill in the base radical information
    if (record.id.indexOf('-') !== -1) {
      const base = baseRadicals.get(record.r);
      if (!base) {
        throw new Error('Radicals out of order--no base radical found');
      }
      radicalData.base = stripFields(base, ['id', 'r']);
      // We use the `k` field from the base radical
      radicalData.k = base.k;
    } else {
      // Otherwise, store the base radical information
      baseRadicals.set(record.r, radicalData);
    }

    const keys = [record.b, record.k].filter(Boolean) as Array<string>;
    for (const key of keys) {
      const existing = result.get(key);
      if (existing) {
        existing.push(radicalData);
      } else {
        result.set(key, [radicalData]);
      }
    }
  }

  return result;
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
