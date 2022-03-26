import { isArrayOfStrings, isFinitePositiveNumber } from './utils';

export interface NameEntryLine {
  id: number;
  // Kanji readings
  k?: Array<string>;
  // Kana readings
  r: Array<string>;
  tr: Array<NameTranslation>;
}

export interface NameTranslation {
  // The type(s) for this entry. This can be missing (e.g. ノコノコ).
  type?: Array<NameType>;
  // The translation text itself.
  det: Array<string>;
  // Cross-references to other entries (in the form of an arbitrary string of
  // Japanese text).
  cf?: Array<string>;
}

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

export const allNameTypes: ReadonlyArray<NameType> = [
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
  'station',
  'surname',
  'unclass',
  'work',
];

export function isNameType(a: unknown): a is NameType {
  return typeof a === 'string' && allNameTypes.includes(a as NameType);
}

export interface NameDeletionLine {
  id: number;
  deleted: true;
}

export function isNameEntryLine(a: any): a is NameEntryLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    // id
    isFinitePositiveNumber(a.id) &&
    // k
    (typeof a.k === 'undefined' || isArrayOfStrings(a.k)) &&
    // r
    isArrayOfStrings(a.r) &&
    // tr
    Array.isArray(a.tr) &&
    (a.tr as Array<any>).every(isNameTranslation) &&
    // deleted (should NOT be present)
    typeof a.deleted === 'undefined'
  );
}

function isNameTranslation(a: any): a is NameTranslation {
  return (
    typeof a === 'object' &&
    a !== null &&
    // We deliberately don't validate the type is one of the recognized ones
    // since the set of name types is likely to change in future (it has in the
    // past) and we don't want to require a major version bump of the database
    // each time.
    //
    // Instead, clients should just ignore types they don't understand or do
    // some suitable fallback.
    (typeof a.type === 'undefined' || isArrayOfStrings(a.type)) &&
    isArrayOfStrings(a.det) &&
    (typeof a.cf === 'undefined' || isArrayOfStrings(a.cf))
  );
}

export function isNameDeletionLine(a: any): a is NameDeletionLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    isFinitePositiveNumber(a.id) &&
    typeof a.deleted === 'boolean' &&
    a.deleted
  );
}
