import * as s from 'superstruct';
import { DataSeries } from './data-series';

import { KanjiRecord, Misc, Radical, Readings } from './kanji-v2';
import { NameRecord, NameTranslation } from './names-v2';
import { RadicalRecord } from './radicals-v2';
import { Overwrite } from './type-helpers';
import { safeInteger } from './validation-helpers';
import {
  Accent,
  CrossReference,
  KanjiInfo,
  KanjiMeta,
  LangSource,
  ReadingInfo,
  ReadingMeta,
  WordRecord,
  WordSense,
} from './words-v2';

// ----------------------------------------------------------------------------
//
// Words
//
// ----------------------------------------------------------------------------

const KanjiInfoSchema: s.Describe<KanjiInfo> = s.enums([
  'ateji',
  'io',
  'iK',
  'ik',
  'oK',
  'rK',
]);

const KanjiMetaSchema: s.Describe<KanjiMeta> = s.type({
  i: s.optional(s.nonempty(s.array(KanjiInfoSchema))),
  p: s.optional(s.nonempty(s.array(s.string()))),
});

const ReadingInfoSchema: s.Describe<ReadingInfo> = s.enums([
  'gikun',
  'ik',
  'ok',
  'uK',
]);

type LooselyCheckedAccent = Overwrite<Accent, { pos?: Array<string> }>;

const AccentSchema: s.Describe<LooselyCheckedAccent> = s.type({
  i: s.min(safeInteger(), 0),
  pos: s.optional(s.nonempty(s.array(s.string()))),
});

export type LooselyCheckedReadingMeta = Overwrite<
  ReadingMeta,
  {
    a?: number | Array<LooselyCheckedAccent>;
  }
>;

const ReadingMetaSchema: s.Describe<LooselyCheckedReadingMeta> = s.type({
  i: s.optional(s.nonempty(s.array(ReadingInfoSchema))),
  p: s.optional(s.nonempty(s.array(s.string()))),
  app: s.optional(s.min(safeInteger(), 0)),
  a: s.optional(s.union([s.min(safeInteger(), 0), s.array(AccentSchema)])),
});

// The following typing is because Describe struggles with union types
const CrossReferenceSchema: s.Struct<s.Describe<CrossReference>['TYPE'], null> =
  s.union([
    s.type({
      k: s.nonempty(s.string()),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
    s.type({
      r: s.nonempty(s.string()),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
    s.type({
      k: s.nonempty(s.string()),
      r: s.string(),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
  ]);

const LangSourceSchema: s.Describe<LangSource> = s.type({
  lang: s.optional(s.nonempty(s.string())),
  src: s.optional(s.string()),
  // The following should be:
  //
  //   part: s.optional(s.literal(true)),
  //   wasei: s.optional(s.literal(true)),
  //
  // But Describe doesn't seem to handle optional boolean literals so we try
  // this way for now.
  part: s.union([s.literal(true), s.literal(undefined)]),
  wasei: s.union([s.literal(true), s.literal(undefined)]),
});

type LooselyCheckedWordSense = Overwrite<
  WordSense,
  {
    // We don't verify that that the pos, field, misc, and dial fields are one of
    // the expected values because we don't want to have to force a major revision
    // of the database each time a new value is added.
    pos?: Array<string>;
    field?: Array<string>;
    misc?: Array<string>;
    dial?: Array<string>;
  }
>;

const WordSenseSchema: s.Describe<LooselyCheckedWordSense> = s.type({
  g: s.nonempty(s.array(s.nonempty(s.string()))),
  gt: s.optional(s.min(safeInteger(), 1)),
  lang: s.optional(s.nonempty(s.string())),
  kapp: s.optional(s.min(safeInteger(), 0)),
  rapp: s.optional(s.min(safeInteger(), 0)),
  pos: s.optional(s.array(s.string())),
  field: s.optional(s.array(s.string())),
  misc: s.optional(s.array(s.string())),
  dial: s.optional(s.array(s.string())),
  inf: s.optional(s.nonempty(s.string())),
  xref: s.optional(s.nonempty(s.array(CrossReferenceSchema))),
  ant: s.optional(s.nonempty(s.array(CrossReferenceSchema))),
  lsrc: s.optional(s.nonempty(s.array(LangSourceSchema))),
});

const WordIdSchema = s.min(safeInteger(), 1);

export type WordDownloadRecord = Overwrite<
  WordRecord,
  {
    km?: Array<0 | KanjiMeta>;
    rm?: Array<0 | LooselyCheckedReadingMeta>;
    s: Array<LooselyCheckedWordSense>;
  }
>;

const WordDownloadRecordSchema: s.Describe<WordDownloadRecord> = s.type({
  id: WordIdSchema,
  k: s.optional(s.nonempty(s.array(s.string()))),
  km: s.optional(s.nonempty(s.array(s.union([s.literal(0), KanjiMetaSchema])))),
  r: s.array(s.nonempty(s.nonempty(s.string()))),
  rm: s.optional(
    s.nonempty(s.array(s.union([s.literal(0), ReadingMetaSchema])))
  ),
  s: s.array(WordSenseSchema),
});

export function validateWordDownloadRecord(
  record: unknown
): [Error, undefined] | [undefined, WordDownloadRecord] {
  return s.validate(record, WordDownloadRecordSchema);
}

// -- Delete variant --

export type WordDownloadDeleteRecord = Pick<WordDownloadRecord, 'id'>;

const WordDownloadDeleteRecordSchema: s.Describe<WordDownloadDeleteRecord> =
  s.type({
    id: WordIdSchema,
  });

export function validateWordDownloadDeleteRecord(
  record: unknown
): [Error, undefined] | [undefined, WordDownloadDeleteRecord] {
  return s.validate(record, WordDownloadDeleteRecordSchema);
}

// ----------------------------------------------------------------------------
//
// Names
//
// ----------------------------------------------------------------------------

type LooselyCheckedNameTranslation = Overwrite<
  NameTranslation,
  {
    // We don't validate the type is one of the recognized ones since the set of
    // name types is likely to change in future (it has in the past) and we don't
    // want to require a major version bump of the database each time.
    //
    // Instead, clients should just ignore types they don't understand or do
    // some suitable fallback.
    type?: Array<string>;
  }
>;

const NameTranslationSchema: s.Describe<LooselyCheckedNameTranslation> = s.type(
  {
    type: s.optional(s.nonempty(s.array(s.string()))),
    det: s.array(s.nonempty(s.string())),
    cf: s.optional(s.array(s.nonempty(s.string()))),
  }
);

const NameIdSchema = s.min(safeInteger(), 1);

export type NameDownloadRecord = Overwrite<
  NameRecord,
  {
    tr: Array<LooselyCheckedNameTranslation>;
  }
>;

const NameDownloadRecordSchema: s.Describe<NameDownloadRecord> = s.type({
  id: NameIdSchema,
  k: s.optional(s.nonempty(s.array(s.nonempty(s.string())))),
  r: s.nonempty(s.array(s.nonempty(s.string()))),
  tr: s.array(NameTranslationSchema),
});

export function validateNameDownloadRecord(
  record: unknown
): [Error, undefined] | [undefined, NameDownloadRecord] {
  return s.validate(record, NameDownloadRecordSchema);
}

// -- Delete variant --

export type NameDownloadDeleteRecord = Pick<NameDownloadRecord, 'id'>;

const NameDownloadDeleteRecordSchema: s.Describe<NameDownloadDeleteRecord> =
  s.type({
    id: NameIdSchema,
  });

export function validateNameDownloadDeleteRecord(
  record: unknown
): [Error, undefined] | [undefined, NameDownloadDeleteRecord] {
  return s.validate(record, NameDownloadDeleteRecordSchema);
}

// ----------------------------------------------------------------------------
//
// Kanji
//
// ----------------------------------------------------------------------------

const ReadingsStruct: s.Describe<Readings> = s.type({
  on: s.optional(s.array(s.string())),
  kun: s.optional(s.array(s.string())),
  na: s.optional(s.array(s.string())),
  py: s.optional(s.array(s.string())),
});

const RadicalStruct: s.Describe<Radical> = s.type({
  x: s.min(safeInteger(), 0),
  nelson: s.optional(s.min(safeInteger(), 0)),
  name: s.optional(s.array(s.string())),
  var: s.optional(s.string()),
});

const MiscSchema: s.Describe<Misc> = s.type({
  gr: s.optional(safeInteger()),
  sc: s.min(safeInteger(), 1),
  freq: s.optional(s.min(safeInteger(), 0)),
  jlpt: s.optional(s.min(safeInteger(), 1)),
  jlptn: s.optional(s.min(safeInteger(), 1)),
  kk: s.optional(s.min(safeInteger(), 1)),
  meta: s.optional(s.array(s.string())),
});

const KanjiIdSchema = s.nonempty(s.string());

export type KanjiDownloadRecord = KanjiRecord;

const KanjiDownloadRecordSchema: s.Describe<KanjiDownloadRecord> = s.type({
  c: KanjiIdSchema,
  r: ReadingsStruct,
  m: s.array(s.string()),
  m_lang: s.optional(s.nonempty(s.string())),
  rad: RadicalStruct,
  refs: s.record(s.string(), s.union([s.string(), s.number()])),
  misc: MiscSchema,
  comp: s.optional(s.nonempty(s.string())),
  var: s.optional(s.array(s.string())),
  cf: s.optional(s.nonempty(s.string())),
});

export function validateKanjiDownloadRecord(
  record: unknown
): [Error, undefined] | [undefined, KanjiDownloadRecord] {
  return s.validate(record, KanjiDownloadRecordSchema);
}

// -- Delete variant --

export type KanjiDownloadDeleteRecord = Pick<KanjiDownloadRecord, 'c'>;

const KanjiDownloadDeleteRecordSchema: s.Describe<KanjiDownloadDeleteRecord> =
  s.type({
    c: KanjiIdSchema,
  });

export function validateKanjiDownloadDeleteRecord(
  record: unknown
): [Error, undefined] | [undefined, KanjiDownloadDeleteRecord] {
  return s.validate(record, KanjiDownloadDeleteRecordSchema);
}

// ----------------------------------------------------------------------------
//
// Radicals
//
// ----------------------------------------------------------------------------

const RadicalIdSchema = s.nonempty(s.string());

export type RadicalDownloadRecord = Overwrite<
  RadicalRecord,
  {
    // We don't validate the posn field for downloaded records because we don't
    // want to force a major version bump every time we add a posn field.
    posn?: string;
  }
>;

const RadicalDownloadRecordSchema: s.Describe<RadicalDownloadRecord> = s.type({
  id: RadicalIdSchema,
  r: s.min(safeInteger(), 1),
  b: s.optional(s.nonempty(s.string())),
  k: s.optional(s.nonempty(s.string())),
  pua: s.optional(safeInteger()),
  s: safeInteger(),
  na: s.array(s.nonempty(s.string())),
  posn: s.optional(s.nonempty(s.string())),
  m: s.array(s.nonempty(s.string())),
  m_lang: s.optional(s.nonempty(s.string())),
});

export function validateRadicalDownloadRecord(
  record: unknown
): [Error, undefined] | [undefined, RadicalDownloadRecord] {
  return s.validate(record, RadicalDownloadRecordSchema);
}

// -- Delete variant --

export type RadicalDownloadDeleteRecord = Pick<RadicalDownloadRecord, 'id'>;

const RadicalDownloadDeleteRecordSchema: s.Describe<RadicalDownloadDeleteRecord> =
  s.type({
    id: RadicalIdSchema,
  });

export function validateRadicalDownloadDeleteRecord(
  record: unknown
): [Error, undefined] | [undefined, RadicalDownloadDeleteRecord] {
  return s.validate(record, RadicalDownloadDeleteRecordSchema);
}

// ----------------------------------------------------------------------------
//
// Combined types
//
// ----------------------------------------------------------------------------

type DownloadRecordMapping = {
  words: WordDownloadRecord;
  names: NameDownloadRecord;
  kanji: KanjiDownloadRecord;
  radicals: RadicalDownloadRecord;
};

export type DownloadRecord<T extends DataSeries> = DownloadRecordMapping[T];

const validateDownloadRecordMapping: {
  [Series in DataSeries]: (
    record: unknown
  ) => [Error, undefined] | [undefined, DownloadRecord<Series>];
} = {
  words: validateWordDownloadRecord,
  names: validateNameDownloadRecord,
  kanji: validateKanjiDownloadRecord,
  radicals: validateRadicalDownloadRecord,
};

export function validateDownloadRecord<Series extends DataSeries>({
  series,
  record,
}: {
  series: Series;
  record: unknown;
}) {
  return validateDownloadRecordMapping[series](record);
}

// -- Delete variant --

type DownloadDeleteRecordMapping = {
  words: WordDownloadDeleteRecord;
  names: NameDownloadDeleteRecord;
  kanji: KanjiDownloadDeleteRecord;
  radicals: RadicalDownloadDeleteRecord;
};

export type DownloadDeleteRecord<T extends DataSeries> =
  DownloadDeleteRecordMapping[T];

const validateDownloadDeleteRecordMapping: {
  [Series in DataSeries]: (
    record: unknown
  ) => [Error, undefined] | [undefined, DownloadDeleteRecord<Series>];
} = {
  words: validateWordDownloadDeleteRecord,
  names: validateNameDownloadDeleteRecord,
  kanji: validateKanjiDownloadDeleteRecord,
  radicals: validateRadicalDownloadDeleteRecord,
};

export function validateDownloadDeleteRecord<Series extends DataSeries>({
  series,
  record,
}: {
  series: Series;
  record: unknown;
}) {
  return validateDownloadDeleteRecordMapping[series](record);
}
