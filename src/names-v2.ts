export type NameRecord = {
  id: number;
  // Kanji readings
  k?: Array<string>;
  // Kana readings
  r: Array<string>;
  tr: Array<NameTranslation>;
};

export type NameTranslation = {
  // The type(s) for this entry. This can be missing (e.g. ノコノコ).
  type?: Array<NameType>;
  // The translation text itself.
  det: Array<string>;
  // Cross-references to other entries (in the form of an arbitrary string of
  // Japanese text).
  cf?: Array<string>;
};

export type NameType =
  | 'char'
  | 'company'
  | 'creat'
  | 'dei'
  | 'doc'
  | 'ev'
  | 'fem'
  | 'fict'
  | 'given'
  | 'group'
  | 'leg'
  | 'masc'
  | 'myth'
  | 'obj'
  | 'org'
  | 'oth'
  | 'person'
  | 'place'
  | 'product'
  | 'relig'
  | 'serv'
  | 'station'
  | 'surname'
  | 'unclass'
  | 'work';
