import { JpdictDatabase } from './database';
import { isKanji } from './japanese';
import { toWordRecord, WordRecord } from './records';
import { JpdictStore } from './store';
import { getTokens } from './tokenizer';
import { WordEntryLine, WordSense } from './words';

export class JpdictFullTextDatabase extends JpdictDatabase {
  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    super({ verbose });
    this.store = new JpdictFullTextStore();
  }
}

class JpdictFullTextStore extends JpdictStore {
  public toWordRecord = toFullTextWordRecord;
}

export function toFullTextWordRecord(entry: WordEntryLine): WordRecord {
  return {
    ...toWordRecord(entry),
    kc: getKanjiForEntry(entry),
    gt_en: getGlossTokensForEntry(entry, 'en'),
    gt_l: getGlossTokensForEntry(entry, 'locale'),
  };
}

// Get the set of kanji characters in an entry
function getKanjiForEntry(entry: WordEntryLine): Array<string> {
  // Extract them into an array of arrays
  const initialKc = (entry.k || []).map((k) => [...k].filter(isKanji));
  // Flatten the array (Array.flat() is not available in TS DOM typings yet.)
  const flatKc = ([] as Array<string>).concat(...initialKc);
  // Return the de-duplicated set
  return [...new Set(flatKc)];
}

function getGlossTokensForEntry(
  entry: WordEntryLine,
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

  const allTokens = entry.s
    .filter(isMatchingSense)
    .reduce(
      (tokens: Array<string>, sense: WordSense) =>
        tokens.concat(...getTokensForSense(sense)),
      []
    );

  return [...new Set(allTokens)];
}
