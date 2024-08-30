import { KanjiMiscInfo, KanjiReading, Radical } from './kanji';
import { NameRecord } from './names';
import { Overwrite, Resolve } from './type-helpers';
import { GlossType, KanjiMeta, ReadingMeta, WordSense } from './words';

// -------------------------------------------------------------------------
//
// Words
//
// -------------------------------------------------------------------------

export type WordResult = {
  id: number;
  k: Array<ExtendedKanjiEntry>;
  r: Array<ExtendedKanaEntry>;
  s: Array<ExtendedSense>;
};

export type ExtendedKanjiEntry = Resolve<
  {
    ent: string;
    match: boolean;
    // If set, indicates that the match occurred on this headword and
    // indicates the range of characters that matched.
    matchRange?: [start: number, end: number];
  } & Overwrite<
    KanjiMeta,
    {
      wk?: number;
      bv?: { l: number; src?: string };
      bg?: { l: number; src?: string };
    }
  >
>;

export type ExtendedKanaEntry = Resolve<
  {
    ent: string;
    match: boolean;
    // If set, indicates that the match occurred on this headword and
    // indicates the range of characters that matched.
    matchRange?: [start: number, end: number];
  } & Overwrite<
    ReadingMeta,
    {
      wk?: number;
      bv?: { l: number; src?: string };
      bg?: { l: number; src?: string };
    }
  >
>;

export type ExtendedSense = Resolve<
  { match: boolean; g: Array<Gloss> } & Omit<WordSense, 'g' | 'gt'>
>;

export type Gloss = {
  str: string;
  type?: GlossType; // undefined = 'none'
  // Character offsets for matched text when doing a gloss search
  matchRange?: [start: number, end: number];
};

// -------------------------------------------------------------------------
//
// Kanji
//
// -------------------------------------------------------------------------

export type KanjiResult = {
  c: string;
  r: KanjiReading;
  m: Array<string>;
  m_lang: string;
  rad: ExpandedRadical;
  refs: Record<string, string | number>;
  misc: KanjiMiscInfo;
  st?: string;
  comp: Array<{
    c: string;
    na: Array<string>;
    // An optional field indicating the kanji character to link to.
    //
    // For example, if the component is ⺮, one might want to look up other
    // kanji with that component, but they also might want to look up the
    // corresponding kanji for the component, i.e. 竹.
    //
    // For kanji / katakana components this is empty. For radical components
    // this is the kanji of the base radical, if any.
    k?: string;
    m: Array<string>;
    m_lang: string;
  }>;
  var?: Array<string>;
  cf: Array<RelatedKanji>;
};

export type ExpandedRadical = Resolve<
  Omit<Radical, 'name'> & {
    b?: string;
    k?: string;
    na: Array<string>;
    m: Array<string>;
    m_lang: string;
    base?: {
      b?: string;
      k?: string;
      na: Array<string>;
      m: Array<string>;
      m_lang: string;
    };
  }
>;

export type RelatedKanji = {
  c: string;
  r: KanjiReading;
  m: Array<string>;
  m_lang: string;
  misc: KanjiMiscInfo;
};

// -------------------------------------------------------------------------
//
// Names
//
// -------------------------------------------------------------------------

export type NameResult = NameRecord;
