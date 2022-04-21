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
  // Information about the kanji string
  i?: Array<KanjiInfo>;

  // Priority information
  p?: Array<string>;
};

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

export type Accent = {
  // Syllable number of the accent (after which the drop occurs).
  // 0 = 平板
  i: number;
  pos?: Array<PartOfSpeech>;
};

export type ReadingInfo =
  // gikun (meaning as reading) or jukujikun (special kanji reading)
  | 'gikun'
  // word containing irregular kana usage
  | 'ik'
  // out-dated or obsolete kana usage
  | 'ok'
  // word usually written using kanji alone
  | 'uK';

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

export const enum GlossType {
  None,
  Expl,
  Lit,
  Fig,
  Tm,
}
export const GLOSS_TYPE_MAX: number = GlossType.Tm;
export const BITS_PER_GLOSS_TYPE = Math.floor(Math.log2(GLOSS_TYPE_MAX)) + 1;

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
