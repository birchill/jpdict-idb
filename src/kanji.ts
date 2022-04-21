export type KanjiRecord = {
  c: string;
  r: Readings;
  m: Array<string>;
  m_lang?: string;
  rad: Radical;
  refs: Record<string, string | number>;
  misc: Misc;
  comp?: string;
  var?: Array<string>;
  cf?: string;
};

export type Readings = {
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

export type Misc = {
  gr?: number;
  sc: number;
  freq?: number;
  jlpt?: number;
  jlptn?: number;
  kk?: number;
  meta?: Array<string>;
};
