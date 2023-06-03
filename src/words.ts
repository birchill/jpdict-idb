export type WordRecord = {
  id: number;

  // Kanji readings for the entry
  k?: Array<string>;
  km?: Array<null | KanjiMeta>;

  // Kana readings for the entry
  r: Array<string>;
  rm?: Array<null | ReadingMeta>;

  // Sense information
  s: Array<WordSense>;
};

export type KanjiMeta = {
  // Information about a kanji headword
  //
  // Typically this should be of type KanjiInfo but we allow it to be any string
  // in case new types are introduced in future and the client has yet to be
  // updated.
  i?: Array<string>;

  // Priority information
  p?: Array<string>;
};

export type ReadingMeta = {
  // Information about the reading
  //
  // Typically this should be of type ReadingInfo but we allow it to be any
  // string in case new types are introduced in future and the client has yet to
  // be updated.
  i?: Array<string>;

  // Priority information
  p?: Array<string>;

  // Bitfield representing which kanji entries (based on their order in the k
  // array) the reading applies to. 0 means it applies to none of them. If the
  // field is absent, it means the reading applies to all of the kanji entries.
  app?: number;

  // Pitch accent information.
  a?: number | Array<Accent>;
};

export type Accent = {
  // Syllable number of the accent (after which the drop occurs).
  // 0 = 平板
  i: number;

  // This should typically be a PartOfSpeech value.
  pos?: Array<string>;
};

export type WordSense = {
  g: Array<string>;
  // A bitfield representing the type of the glosses in `g`. Two bits are used
  // to represent the type of each item in `g`, where each two-bit value is one
  // of the GlossType values below.
  //
  // Undefined if the value is 0 (i.e. no glosses have a type, the most common
  // case).
  gt?: number;
  // undefined = 'en'
  lang?: string;

  // Bit field representing the kanji / kana entries this sense applies to.
  // If the sense applies to all entries the field will be undefined.
  kapp?: number;
  rapp?: number;

  // Extra information about the sense.

  // Typically a PartOfSpeech value
  pos?: Array<string>;
  // Typically a FieldType value
  field?: Array<string>;
  // Typically a MiscType value
  misc?: Array<string>;
  // Typically a Dialect value
  dial?: Array<string>;
  inf?: string;
  xref?: Array<CrossReference>;
  ant?: Array<CrossReference>;

  // Language source information.
  lsrc?: Array<LangSource>;
};

export const GlossTypes = ['none', 'expl', 'lit', 'fig', 'tm'] as const;
export type GlossType = (typeof GlossTypes)[number];
export const GLOSS_TYPE_MAX = GlossTypes.length;
export const BITS_PER_GLOSS_TYPE = Math.floor(Math.log2(GLOSS_TYPE_MAX)) + 1;

export type CrossReference =
  | {
      k: string;
      sense?: number;
    }
  | {
      r: string;
      sense?: number;
    }
  | {
      k: string;
      r: string;
      sense?: number;
    };

export type LangSource = {
  // undefined = 'en'
  lang?: string;

  // The term in the source language
  //
  // This may be empty in some cases.
  src?: string;

  // Partial source (i.e. this only represents part of the string)
  // absent = false
  part?: true;

  // The Japanese word is made from words from another language but doesn't
  // actually represent the meaning of those words literally.
  wasei?: true;
};

// ----------------------------------------------------------------------------
//
// Supplemental types that may be used to further refine the fields above
//
// ----------------------------------------------------------------------------

// KanjiInfo

export type KanjiInfo = (typeof kanjiInfoValues)[number];

const kanjiInfoValues = [
  // ateji (phonetic) reading
  'ateji',
  // irregular okurigana usage
  'io',
  // word containing irregular kanji usage
  'iK',
  // word containing irregular kana usage
  'ik',
  // word containing out-dated kanji or kanji usage
  'oK',
  // rarely-used kanji form
  'rK',
  // search-only kanji form
  'sK',
] as const;

export function isKanjiInfo(a: unknown): a is KanjiInfo {
  return typeof a === 'string' && kanjiInfoValues.includes(a as KanjiInfo);
}

export function asKanjiInfo(a: unknown): KanjiInfo | undefined {
  return isKanjiInfo(a) ? a : undefined;
}

// ReadingInfo

export type ReadingInfo = (typeof allReadingInfo)[number];

const allReadingInfo = [
  // gikun (meaning as reading) or jukujikun (special kanji reading)
  'gikun',
  // word containing irregular kana usage
  'ik',
  // out-dated or obsolete kana usage
  'ok',
  // word usually written using kanji alone
  'uK',
  // search-only kana form
  'sk',
] as const;

export function isReadingInfo(a: unknown): a is ReadingInfo {
  return typeof a === 'string' && allReadingInfo.includes(a as ReadingInfo);
}

export function asReadingInfo(a: unknown): ReadingInfo | undefined {
  return isReadingInfo(a) ? a : undefined;
}

// Part of speech

export type PartOfSpeech = (typeof allPartsOfSpeech)[number];

// prettier-ignore
const allPartsOfSpeech = [
  'adj-f', 'adj-i', 'adj-ix', 'adj-kari', 'adj-ku', 'adj-na', 'adj-nari',
  'adj-no', 'adj-pn', 'adj-shiku', 'adj-t', 'adv', 'adv-to', 'aux', 'aux-adj',
  'aux-v', 'conj', 'cop', 'ctr', 'exp', 'int', 'n', 'n-adv', 'n-pr', 'n-pref',
  'n-suf', 'n-t', 'num', 'pn', 'pref', 'prt', 'suf', 'unc', 'v-unspec', 'v1',
  'v1-s', 'v2a-s', 'v2b-k', 'v2b-s', 'v2d-k', 'v2d-s', 'v2g-k', 'v2g-s',
  'v2h-k', 'v2h-s', 'v2k-k', 'v2k-s', 'v2m-k', 'v2m-s', 'v2n-s', 'v2r-k',
  'v2r-s', 'v2s-s', 'v2t-k', 'v2t-s', 'v2w-s', 'v2y-k', 'v2y-s', 'v2z-s', 'v4b',
  'v4g', 'v4h', 'v4k', 'v4m', 'v4n', 'v4r', 'v4s', 'v4t', 'v5aru', 'v5b', 'v5g',
  'v5k', 'v5k-s', 'v5m', 'v5n', 'v5r', 'v5r-i', 'v5s', 'v5t', 'v5u', 'v5u-s',
  'v5uru', 'vi', 'vk', 'vn', 'vr', 'vs', 'vs-c', 'vs-i', 'vs-s', 'vt', 'vz',
] as const;

export function isPartOfSpeech(a: unknown): a is PartOfSpeech {
  return typeof a === 'string' && allPartsOfSpeech.includes(a as PartOfSpeech);
}

export function asPartOfSpeech(a: unknown): PartOfSpeech | undefined {
  return isPartOfSpeech(a) ? a : undefined;
}

// Field

export type FieldType = (typeof allFieldTypes)[number];

// prettier-ignore
const allFieldTypes = [
  'agric', 'anat', 'archeol', 'archit', 'art', 'astron', 'audvid', 'aviat',
  'baseb', 'biochem', 'biol', 'bot', 'Buddh', 'bus', 'cards', 'chem', 'Christn',
  'cloth', 'comp', 'cryst', 'dent', 'ecol', 'econ', 'elec', 'electr', 'embryo',
  'engr', 'ent', 'film', 'finc', 'fish', 'food', 'gardn', 'genet', 'geogr',
  'geol', 'geom', 'go', 'golf', 'gramm', 'grmyth', 'hanaf', 'horse', 'kabuki',
  'law', 'ling', 'logic', 'MA', 'mahj', 'manga', 'math', 'mech', 'med', 'met',
  'mil', 'mining', 'music', 'noh', 'ornith', 'paleo', 'pathol', 'pharm', 'phil',
  'photo', 'physics', 'physiol', 'politics', 'print', 'psy', 'psyanal', 'psych',
  'rail', 'rommyth', 'Shinto', 'shogi', 'ski', 'sports', 'stat', 'stockm',
  'sumo', 'telec', 'tradem', 'tv', 'vidg', 'zool',
] as const;

export function isFieldType(a: unknown): a is FieldType {
  return typeof a === 'string' && allFieldTypes.includes(a as FieldType);
}

export function asFieldType(a: unknown): FieldType | undefined {
  return isFieldType(a) ? a : undefined;
}

// Misc types. A few of these are not used (e.g. male-sl, uK) but they have
// entity definitions in the upstream XML file so we include them here.

export type MiscType = (typeof allMiscTypes)[number];

// prettier-ignore
const allMiscTypes = [
  'abbr', 'aphorism', 'arch', 'char', 'chn', 'col', 'company', 'creat', 'dated',
  'dei', 'derog', 'doc', 'ev', 'euph', 'fam', 'fem', 'fict', 'form', 'given',
  'group', 'hist', 'hon', 'hum', 'id', 'joc', 'leg', 'm-sl', 'male', 'myth',
  'net-sl', 'obj', 'obs', 'obsc', 'on-mim', 'organization', 'oth', 'person',
  'place', 'poet', 'pol', 'product', 'proverb', 'quote', 'rare', 'relig',
  'sens', 'serv', 'ship', 'sl', 'station', 'surname', 'uk', 'unclass', 'vulg',
  'work', 'X', 'yoji', ] as
  const;

export function isMiscType(a: unknown): a is MiscType {
  return typeof a === 'string' && allMiscTypes.includes(a as MiscType);
}

export function asMiscType(a: unknown): MiscType | undefined {
  return isMiscType(a) ? a : undefined;
}

// Dialects

export type Dialect = (typeof allDialects)[number];

const allDialects = [
  'bra', // Brazilian
  'ho', // Hokkaido
  'tsug', // Tsugaru
  'th', // Tohoku
  'na', // Nagano
  'kt', // Kanto
  'ks', // Kansai
  'ky', // Kyoto
  'os', // Osaka
  'ts', // Tosa
  '9s', // Kyushu
  'ok', // Ryuukyuu
] as const;

export function isDialect(a: unknown): a is Dialect {
  return typeof a === 'string' && allDialects.includes(a as Dialect);
}

export function asDialect(a: unknown): Dialect | undefined {
  return isDialect(a) ? a : undefined;
}
