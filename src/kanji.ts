export type KanjiRecord = {
  c: string;
  r: KanjiReading;
  m: Array<string>;
  m_lang?: string;
  rad: Radical;
  refs: Record<string, string | number>;
  misc: KanjiMiscInfo;
  comp?: string;
  var?: Array<string>;
  cf?: string;
};

export type KanjiReading = {
  on?: Array<string>;
  kun?: Array<string>;
  na?: Array<string>;
  py?: Array<string>;
};

export type Radical = {
  x: number;
  nelson?: number;
  name?: Array<string>;
};

export type KanjiMiscInfo = {
  gr?: number;
  sc: number;
  freq?: number;
  jlpt?: number;
  jlptn?: number;
  kk?: number;
  meta?: Array<string>;
};
