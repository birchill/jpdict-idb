import { isArrayOfStrings } from './utils';

export interface RadicalEntryLine {
  id: string;
  r: number;
  b?: string;
  k?: string;
  pua?: number;
  s: number;
  na: Array<string>;
  posn?: 'hen' | 'tsukuri' | 'kanmuri' | 'ashi' | 'tare' | 'nyou' | 'kamae';
  m: Array<string>;
  m_lang?: string;
}

export interface RadicalDeletionLine {
  id: string;
  deleted: true;
}

export function isRadicalEntryLine(a: any): a is RadicalEntryLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    // c
    typeof a.id === 'string' &&
    !!(a.id as string).length &&
    // r
    typeof a.r === 'number' &&
    // b
    (typeof a.b === 'undefined' || typeof a.b === 'string') &&
    // k
    (typeof a.k === 'undefined' || typeof a.k === 'string') &&
    // pua
    (typeof a.pua === 'undefined' || typeof a.pua === 'number') &&
    // s
    typeof a.s === 'number' &&
    // na
    isArrayOfStrings(a.na) &&
    // posn
    (typeof a.posn === 'undefined' || typeof a.posn === 'string') &&
    // m
    isArrayOfStrings(a.m) &&
    // deleted (should NOT be present)
    typeof a.deleted === 'undefined'
  );
}

export function isRadicalDeletionLine(a: any): a is RadicalDeletionLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.id === 'string' &&
    !!(a.id as string).length &&
    typeof a.deleted === 'boolean' &&
    a.deleted
  );
}
