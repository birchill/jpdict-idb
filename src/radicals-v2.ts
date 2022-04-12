export type RadicalRecord = {
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
};
