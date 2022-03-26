import { isArrayOfStrings, isFinitePositiveNumber } from './utils';

export interface WordEntryLine {
  id: number;

  // Kanji readings for the entry
  k?: Array<string>;
  km?: Array<0 | KanjiMeta>;

  // Kana readings for the entry
  r: Array<string>;
  rm?: Array<0 | ReadingMeta>;

  // Sense information
  s: Array<WordSense>;
}

export type KanjiMeta = {
  // Information about the kanji string
  i?: Array<KanjiInfo>;

  // Priority information
  p?: Array<string>;
};

function isKanjiMeta(a: unknown): a is KanjiMeta {
  return (
    typeof a === 'object' &&
    a !== null &&
    // i
    (typeof (a as KanjiMeta).i === 'undefined' ||
      (Array.isArray((a as KanjiMeta).i) &&
        ((a as KanjiMeta).i as Array<any>).every(isKanjiInfo))) &&
    // p
    (typeof (a as KanjiMeta).p === 'undefined' ||
      isArrayOfStrings((a as KanjiMeta).p))
  );
}

export type KanjiInfo =
  // ateji (phonetic) reading
  | 'ateji'
  // irregular okurigana usage
  | 'io'
  // word containing irregular kanji usage
  | 'iK'
  // word containing irregular kana usage
  | 'ik'
  // word containing out-dated kanji or kanji usage
  | 'oK'
  // rarely-used kanji form
  | 'rK';

export const allKanjiInfo: ReadonlyArray<KanjiInfo> = [
  'ateji',
  'io',
  'iK',
  'ik',
  'oK',
  'rK',
];

export function isKanjiInfo(a: unknown): a is KanjiInfo {
  return typeof a === 'string' && allKanjiInfo.includes(a as KanjiInfo);
}

export type ReadingMeta = {
  // Information about the reading
  i?: Array<ReadingInfo>;

  // Priority information
  p?: Array<string>;

  // Bitfield representing which kanji entries (based on their order in the k
  // array) the reading applies to. 0 means it applies to none of them. If the
  // field is absent, it means the reading applies to all of the kanji entries.
  app?: number;

  // Pitch accent information.
  a?: number | Array<Accent>;
};

function isReadingMeta(a: unknown): a is ReadingMeta {
  return (
    typeof a === 'object' &&
    a !== null &&
    // i
    (typeof (a as ReadingMeta).i === 'undefined' ||
      (Array.isArray((a as ReadingMeta).i) &&
        ((a as ReadingMeta).i as Array<any>).every(isReadingInfo))) &&
    // p
    (typeof (a as ReadingMeta).p === 'undefined' ||
      isArrayOfStrings((a as ReadingMeta).p)) &&
    // app
    (typeof (a as ReadingMeta).app === 'undefined' ||
      isFinitePositiveNumber((a as ReadingMeta).app)) &&
    // a
    (typeof (a as ReadingMeta).a === 'undefined' ||
      typeof (a as ReadingMeta).a === 'number' ||
      (Array.isArray((a as ReadingMeta).a) &&
        ((a as ReadingMeta).a as Array<Accent>).every(isAccent)))
  );
}

export type ReadingInfo =
  // gikun (meaning as reading) or jukujikun (special kanji reading)
  | 'gikun'
  // word containing irregular kana usage
  | 'ik'
  // out-dated or obsolete kana usage
  | 'ok'
  // word usually written using kanji alone
  | 'uK';

export const allReadingInfo: ReadonlyArray<ReadingInfo> = [
  'gikun',
  'ik',
  'ok',
  'uK',
];

export function isReadingInfo(a: unknown): a is ReadingInfo {
  return typeof a === 'string' && allReadingInfo.includes(a as ReadingInfo);
}

export type Accent = {
  // Syllable number of the accent (after which the drop occurs).
  // 0 = 平板
  i: number;
  pos?: Array<PartOfSpeech>;
};

function isAccent(a: unknown): a is Accent {
  return (
    typeof a === 'object' &&
    a !== null &&
    // i
    isFinitePositiveNumber((a as Accent).i) &&
    // pos
    (typeof (a as Accent).pos === 'undefined' ||
      (Array.isArray((a as Accent).pos) &&
        (a as Accent).pos!.every(isPartOfSpeech)))
  );
}

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
  pos?: Array<PartOfSpeech>;
  field?: Array<FieldType>;
  misc?: Array<MiscType>;
  dial?: Array<Dialect>;
  inf?: string;
  xref?: Array<CrossReference>;
  ant?: Array<CrossReference>;

  // Language source information.
  lsrc?: Array<LangSource>;
};

function isWordSense(a: unknown): a is WordSense {
  return (
    // g
    isArrayOfStrings((a as WordSense).g) &&
    // gt
    (typeof (a as WordSense).gt === 'undefined' ||
      isFinitePositiveNumber((a as WordSense).gt)) &&
    // lang
    (typeof (a as WordSense).lang === 'undefined' ||
      typeof (a as WordSense).lang === 'string') &&
    // kapp
    (typeof (a as WordSense).kapp === 'undefined' ||
      isFinitePositiveNumber((a as WordSense).kapp)) &&
    // rapp
    (typeof (a as WordSense).rapp === 'undefined' ||
      isFinitePositiveNumber((a as WordSense).rapp)) &&
    // pos
    //
    // NOTE: We deliberately DON'T verify that that the pos, field, misc, and
    // dial fields are one of the expected values because we don't want to have
    // to force a major revision of the database each time a new value is added.
    //
    // Instead we should just ignore unrecognized values.
    (typeof (a as WordSense).pos === 'undefined' ||
      isArrayOfStrings((a as WordSense).pos)) &&
    // field
    (typeof (a as WordSense).field === 'undefined' ||
      isArrayOfStrings((a as WordSense).field)) &&
    // misc
    (typeof (a as WordSense).misc === 'undefined' ||
      isArrayOfStrings((a as WordSense).misc)) &&
    // dial
    (typeof (a as WordSense).dial === 'undefined' ||
      isArrayOfStrings((a as WordSense).dial)) &&
    // inf
    (typeof (a as WordSense).inf === 'undefined' ||
      typeof (a as WordSense).inf === 'string') &&
    // xref
    (typeof (a as WordSense).xref === 'undefined' ||
      (Array.isArray((a as WordSense).xref) &&
        (a as WordSense).xref!.every(isCrossReference))) &&
    // ant
    (typeof (a as WordSense).ant === 'undefined' ||
      (Array.isArray((a as WordSense).ant) &&
        (a as WordSense).ant!.every(isCrossReference))) &&
    // lsrc
    (typeof (a as WordSense).lsrc === 'undefined' ||
      isLangSource((a as WordSense).lsrc))
  );
}

export const enum GlossType {
  None,
  Expl,
  Lit,
  Fig,
  Tm,
}
export const GLOSS_TYPE_MAX: number = GlossType.Tm;
export const BITS_PER_GLOSS_TYPE = Math.floor(Math.log2(GLOSS_TYPE_MAX)) + 1;

// Part-of-speech types.
//
// prettier-ignore
export type PartOfSpeech =
  | 'adj-f' | 'adj-i' | 'adj-ix' | 'adj-kari' | 'adj-ku' | 'adj-na' | 'adj-nari'
  | 'adj-no' | 'adj-pn' | 'adj-shiku' | 'adj-t' | 'adv' | 'adv-to' | 'aux'
  | 'aux-adj' | 'aux-v' | 'conj' | 'cop' | 'ctr' | 'exp' | 'int' | 'n' | 'n-adv'
  | 'n-pr' | 'n-pref' | 'n-suf' | 'n-t' | 'num' | 'pn' | 'pref' | 'prt' | 'suf'
  | 'unc' | 'v-unspec' | 'v1' | 'v1-s' | 'v2a-s' | 'v2b-k' | 'v2b-s' | 'v2d-k'
  | 'v2d-s' | 'v2g-k' | 'v2g-s' | 'v2h-k' | 'v2h-s' | 'v2k-k' | 'v2k-s'
  | 'v2m-k' | 'v2m-s' | 'v2n-s' | 'v2r-k' | 'v2r-s' | 'v2s-s' | 'v2t-k'
  | 'v2t-s' | 'v2w-s' | 'v2y-k' | 'v2y-s' | 'v2z-s' | 'v4b' | 'v4g' | 'v4h'
  | 'v4k' | 'v4m' | 'v4n' | 'v4r' | 'v4s' | 'v4t' | 'v5aru' | 'v5b' | 'v5g'
  | 'v5k' | 'v5k-s' | 'v5m' | 'v5n' | 'v5r' | 'v5r-i' | 'v5s' | 'v5t' | 'v5u'
  | 'v5u-s' | 'v5uru' | 'vi' | 'vk' | 'vn' | 'vr' | 'vs' | 'vs-c' | 'vs-i'
  | 'vs-s' | 'vt' | 'vz';

// prettier-ignore
export const allPartsOfSpeech: ReadonlyArray<PartOfSpeech> = [
  'adj-f', 'adj-i', 'adj-ix', 'adj-kari', 'adj-ku', 'adj-na', 'adj-nari',
  'adj-no', 'adj-pn', 'adj-shiku', 'adj-t', 'adv', 'adv-to', 'aux',
  'aux-adj', 'aux-v', 'conj', 'cop', 'ctr', 'exp', 'int', 'n', 'n-adv',
  'n-pr', 'n-pref', 'n-suf', 'n-t', 'num', 'pn', 'pref', 'prt', 'suf', 'unc',
  'v-unspec', 'v1', 'v1-s', 'v2a-s', 'v2b-k', 'v2b-s', 'v2d-k', 'v2d-s',
  'v2g-k', 'v2g-s', 'v2h-k', 'v2h-s', 'v2k-k', 'v2k-s', 'v2m-k', 'v2m-s',
  'v2n-s', 'v2r-k', 'v2r-s', 'v2s-s', 'v2t-k', 'v2t-s', 'v2w-s', 'v2y-k',
  'v2y-s', 'v2z-s', 'v4b', 'v4g', 'v4h', 'v4k', 'v4m', 'v4n', 'v4r', 'v4s',
  'v4t', 'v5aru', 'v5b', 'v5g', 'v5k', 'v5k-s', 'v5m', 'v5n', 'v5r', 'v5r-i',
  'v5s', 'v5t', 'v5u', 'v5u-s', 'v5uru', 'vi', 'vk', 'vn', 'vr', 'vs',
  'vs-c', 'vs-i', 'vs-s', 'vt', 'vz'
];

export function isPartOfSpeech(a: unknown): a is PartOfSpeech {
  return typeof a === 'string' && allPartsOfSpeech.includes(a as PartOfSpeech);
}

// prettier-ignore
export type FieldType =
  | 'agric' | 'anat' | 'archeol' | 'archit' | 'art' | 'astron' | 'audvid'
  | 'aviat' | 'baseb' | 'biochem' | 'biol' | 'bot' | 'Buddh' | 'bus' | 'chem'
  | 'Christn' | 'cloth' | 'comp' | 'cryst' | 'ecol' | 'econ' | 'elec' | 'electr'
  | 'embryo' | 'engr' | 'ent' | 'finc' | 'fish' | 'food' | 'gardn' | 'genet'
  | 'geogr' | 'geol' | 'geom' | 'go' | 'golf' | 'gramm' | 'grmyth' | 'hanaf'
  | 'horse' | 'law' | 'ling' | 'logic' | 'MA' | 'mahj' | 'math' | 'mech' | 'med'
  | 'met' | 'mil' | 'music' | 'ornith' | 'paleo' | 'pathol' | 'pharm' | 'phil'
  | 'photo' | 'physics' | 'physiol' | 'print' | 'psy' | 'psych' | 'rail'
  | 'Shinto' | 'shogi' | 'sports' | 'stat' | 'sumo' | 'telec' | 'tradem'
  | 'vidg' | 'zool';

// prettier-ignore
export const allFieldTypes: ReadonlyArray<FieldType> = [
  'agric', 'anat', 'archeol', 'archit', 'art', 'astron', 'audvid', 'aviat',
  'baseb', 'biochem', 'biol', 'bot', 'Buddh', 'bus', 'chem', 'Christn', 'cloth',
  'comp', 'cryst', 'ecol', 'econ', 'elec', 'electr', 'embryo', 'engr', 'ent',
  'finc', 'fish', 'food', 'gardn', 'genet', 'geogr', 'geol', 'geom', 'go',
  'golf', 'gramm', 'grmyth', 'hanaf', 'horse', 'law', 'ling', 'logic', 'MA',
  'mahj', 'math', 'mech', 'med', 'met', 'mil', 'music', 'ornith', 'paleo',
  'pathol', 'pharm', 'phil', 'photo', 'physics', 'physiol', 'print', 'psy',
  'psych', 'rail', 'Shinto', 'shogi', 'sports', 'stat', 'sumo', 'telec',
  'tradem', 'vidg', 'zool'
];

export function isFieldType(a: unknown): a is FieldType {
  return typeof a === 'string' && allFieldTypes.includes(a as FieldType);
}

// Misc types. As with PositionType, a few of these are not used (e.g. male-sl,
// uK) but they have entity definitions so we include them here.
//
// prettier-ignore
export type MiscType =
  | 'abbr' | 'arch' | 'char' | 'chn' | 'col' | 'company' | 'creat' | 'dated'
  | 'dei' | 'derog' | 'doc' | 'ev' | 'fam' | 'fem' | 'fict' | 'form' | 'given'
  | 'group' | 'hist' | 'hon' | 'hum' | 'id' | 'joc' | 'leg' | 'm-sl' | 'male'
  | 'myth' | 'net-sl' | 'obj' | 'obs' | 'obsc' | 'on-mim' | 'organization'
  | 'oth' | 'person' | 'place' | 'poet' | 'pol' | 'product' | 'proverb'
  | 'quote' | 'rare' | 'relig' | 'sens' | 'serv' | 'sl' | 'station' | 'surname'
  | 'uk' | 'unclass' | 'vulg' | 'work' | 'X' | 'yoji';

// prettier-ignore
export const allMiscTypes: ReadonlyArray<MiscType> = [
  'abbr', 'arch', 'char', 'chn', 'col', 'company', 'creat', 'dated',
  'dei', 'derog', 'doc', 'ev', 'fam', 'fem', 'fict', 'form', 'given',
  'group', 'hist', 'hon', 'hum', 'id', 'joc', 'leg', 'm-sl', 'male',
  'myth', 'net-sl', 'obj', 'obs', 'obsc', 'on-mim', 'organization',
  'oth', 'person', 'place', 'poet', 'pol', 'product', 'proverb',
  'quote', 'rare', 'relig', 'sens', 'serv', 'sl', 'station', 'surname',
  'uk', 'unclass', 'vulg', 'work', 'X', 'yoji'
];

export function isMiscType(a: unknown): a is MiscType {
  return typeof a === 'string' && allMiscTypes.includes(a as MiscType);
}

export type Dialect =
  | 'bra' // Brazilian
  | 'ho' // Hokkaido
  | 'tsug' // Tsugaru
  | 'th' // Tohoku
  | 'na' // Nagano
  | 'kt' // Kanto
  | 'ks' // Kansai
  | 'ky' // Kyoto
  | 'os' // Osaka
  | 'ts' // Tosa
  | '9s' // Kyushu
  | 'ok'; // Ryuukyuu

// prettier-ignore
export const allDialects: ReadonlyArray<Dialect> = [
  'bra', 'ho', 'tsug', 'th', 'na', 'kt', 'ks', 'ky', 'os', 'ts', '9s', 'ok',
];

export function isDialect(a: unknown): a is Dialect {
  return typeof a === 'string' && allDialects.includes(a as Dialect);
}

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

export function isCrossReference(a: unknown): a is CrossReference {
  return (
    typeof a === 'object' &&
    a !== null &&
    // Either k or r must be defined
    (typeof (a as any).k === 'string' || typeof (a as any).r === 'string') &&
    // k
    (typeof (a as any).k === 'string' || typeof (a as any).k === 'undefined') &&
    // r
    (typeof (a as any).r === 'string' || typeof (a as any).r === 'undefined') &&
    // sense
    (typeof (a as CrossReference).sense === 'undefined' ||
      isFinitePositiveNumber((a as CrossReference).sense))
  );
}

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

function isLangSource(a: unknown): a is LangSource {
  return (
    typeof a === 'object' &&
    a !== null &&
    // lang
    (typeof (a as LangSource).lang === 'undefined' ||
      typeof (a as LangSource).lang === 'string') &&
    // src
    (typeof (a as LangSource).src === 'undefined' ||
      typeof (a as LangSource).src === 'string') &&
    // part
    (typeof (a as LangSource).part === 'undefined' ||
      (a as LangSource).part === true) &&
    // wasei
    (typeof (a as LangSource).wasei === 'undefined' ||
      (a as LangSource).wasei === true)
  );
}

export interface WordDeletionLine {
  id: number;
  deleted: true;
}

export function isWordEntryLine(a: any): a is WordEntryLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    // id
    isFinitePositiveNumber(a.id) &&
    // k
    (typeof a.k === 'undefined' || isArrayOfStrings(a.k)) &&
    // km
    (typeof a.km === 'undefined' || isKanjiMetaArray(a.km)) &&
    // r
    isArrayOfStrings(a.r) &&
    // rm
    (typeof a.rm === 'undefined' ||
      (Array.isArray(a.rm) &&
        (a.rm as Array<0 | ReadingMeta>).every(
          (rm) => rm === 0 || isReadingMeta(rm)
        ))) &&
    // s
    Array.isArray(a.s) &&
    a.s.every(isWordSense) &&
    // deleted (should NOT be present)
    typeof a.deleted === 'undefined'
  );
}

function isKanjiMetaArray(a: unknown): a is Array<0 | KanjiMeta> {
  return (
    Array.isArray(a) &&
    (a as Array<any>).every(
      (elem) => (typeof elem === 'number' && elem === 0) || isKanjiMeta(elem)
    )
  );
}

export function isWordDeletionLine(a: any): a is WordDeletionLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    isFinitePositiveNumber(a.id) &&
    typeof a.deleted === 'boolean' &&
    a.deleted
  );
}
