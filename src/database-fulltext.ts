import { JpdictIdb } from './database-v2';
import { WordDownloadRecord } from './download-types';
import { isKanji } from './japanese';
import { toWordStoreRecord, WordStoreRecord } from './store-types';
import { JpdictStore } from './store-v2';
import { getTokens } from './tokenizer';
import { WordSense } from './words';

export class JpdictFullTextDatabase extends JpdictIdb {
  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    super({ verbose });
    this.store = new JpdictFullTextStore();
  }
}

class JpdictFullTextStore extends JpdictStore {
  constructor() {
    super();
    this.toStoreRecord.words = toFullTextWordStoreRecord;
  }
}

export function toFullTextWordStoreRecord(
  record: WordDownloadRecord
): WordStoreRecord {
  return {
    ...toWordStoreRecord(record),
    kc: getKanjiForEntry(record),
    gt_en: getGlossTokensForEntry(record, 'en'),
    gt_l: getGlossTokensForEntry(record, 'locale'),
  };
}

// Get the set of kanji characters in an entry
function getKanjiForEntry(record: WordDownloadRecord): Array<string> {
  // Extract them into an array of arrays
  const initialKc = (record.k || []).map((k) => [...k].filter(isKanji));
  // Flatten the array (Array.flat() is not available in TS DOM typings yet.)
  const flatKc = ([] as Array<string>).concat(...initialKc);
  // Return the de-duplicated set
  return [...new Set(flatKc)];
}

type LooseWordSense = WordDownloadRecord['s'][0];

function getGlossTokensForEntry(
  record: WordDownloadRecord,
  lang: 'en' | 'locale'
): Array<string> {
  const getTokensForSense = (sense: LooseWordSense): Array<string> => {
    return sense.g.reduce(
      (tokens: Array<string>, gloss: string) =>
        tokens.concat(...getTokens(gloss, sense.lang || 'en')),
      []
    );
  };

  const isMatchingSense = (sense: LooseWordSense): boolean =>
    lang === 'en'
      ? typeof sense.lang === 'undefined' || sense.lang === 'en'
      : typeof sense.lang !== 'undefined';

  const allTokens = record.s
    .filter(isMatchingSense)
    .reduce(
      (tokens: Array<string>, sense: LooseWordSense) =>
        tokens.concat(...getTokensForSense(sense)),
      []
    );

  return [...new Set(allTokens)];
}
