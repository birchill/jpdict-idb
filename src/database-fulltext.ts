import { JpdictIdb } from './database.js';
import type { WordDownloadRecord } from './download-types.js';
import { isKanji } from './japanese.js';
import type { WordStoreRecord } from './store-types.js';
import { toWordStoreRecord } from './store-types.js';
import { JpdictStore } from './store.js';
import { getTokens } from './tokenizer.js';
import type { WordSense } from './words.js';

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

function toFullTextWordStoreRecord(
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

function getGlossTokensForEntry(
  record: WordDownloadRecord,
  lang: 'en' | 'locale'
): Array<string> {
  const getTokensForSense = (sense: WordSense): Array<string> => {
    return sense.g.reduce(
      (tokens: Array<string>, gloss: string) =>
        tokens.concat(...getTokens(gloss, sense.lang || 'en')),
      []
    );
  };

  const isMatchingSense = (sense: WordSense): boolean =>
    lang === 'en'
      ? typeof sense.lang === 'undefined' || sense.lang === 'en'
      : typeof sense.lang !== 'undefined';

  const allTokens = record.s
    .filter(isMatchingSense)
    .reduce(
      (tokens: Array<string>, sense: WordSense) =>
        tokens.concat(...getTokensForSense(sense)),
      []
    );

  return [...new Set(allTokens)];
}
