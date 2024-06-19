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
  //
  // Typically it will be one of the NameType values below.
  type?: Array<string>;
  // The translation text itself.
  det: Array<string>;
  // Cross-references to other entries (in the form of an arbitrary string of
  // Japanese text).
  cf?: Array<string>;
};

// ----------------------------------------------------------------------------
//
// Supplemental types that may be used to further refine the fields above
//
// ----------------------------------------------------------------------------

// NameType

export type NameType = (typeof allNameTypes)[number];

const allNameTypes = [
  'char',
  'company',
  'creat',
  'dei',
  'doc',
  'ev',
  'fem',
  'fict',
  'given',
  'group',
  'leg',
  'masc',
  'myth',
  'obj',
  'org',
  'oth',
  'person',
  'place',
  'product',
  'relig',
  'serv',
  'ship',
  'station',
  'surname',
  'unclass',
  'work',
] as const;

export function isNameType(a: unknown): a is NameType {
  return typeof a === 'string' && allNameTypes.includes(a as NameType);
}

export function asNameType(a: unknown): NameType | undefined {
  return isNameType(a) ? a : undefined;
}
