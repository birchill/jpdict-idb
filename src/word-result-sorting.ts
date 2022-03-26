import { WordResult } from './word-result';

// As with Array.prototype.sort, sorts `results` in-place, but returns the
// result to support chaining.
export function sortResultsByPriority(
  results: Array<WordResult>
): Array<WordResult> {
  const idToScore: Map<number, number> = new Map();
  for (const result of results) {
    idToScore.set(result.id, getPriority(result));
  }
  results.sort((a, b) => {
    return idToScore.get(b.id)! - idToScore.get(a.id)!;
  });

  return results;
}

export function getPriority(result: WordResult): number {
  // Go through each _matching_ kanji / reading and look for priority
  // information and return the highest score.
  const scores: Array<number> = [0];
  const isHeadwordSearch =
    result.k.some((k) => !!k.matchRange) ||
    result.r.some((r) => !!r.matchRange);

  // Scores from kanji readings
  for (const k of result.k) {
    if ((isHeadwordSearch ? !k.matchRange : !k.match) || !k.p) {
      continue;
    }

    scores.push(getPrioritySum(k.p));
  }

  // Scores from kana readings
  for (const r of result.r) {
    if ((isHeadwordSearch ? !r.matchRange : !r.match) || !r.p) {
      continue;
    }

    scores.push(getPrioritySum(r.p));
  }

  // Return top score
  return Math.max(...scores);
}

// Produce an overall priority from a series of priority strings.
//
// This should produce a value somewhere in the range 0~67.
//
// In general we report the highest priority, but if we have several priority
// scores we add a decreasing fraction (10%) of the lesser scores as an
// indication that several sources have attested to the priority.
//
// That should typically produce a maximum attainable score of 66.8.
// Having a bounded range like this makes it easier to combine this value with
// other metrics when sorting.
function getPrioritySum(priorities: Array<string>): number {
  const scores = priorities.map(getPriorityScore).sort().reverse();
  return scores.length
    ? scores[0] +
        scores
          .slice(1)
          .reduce(
            (total, score, index) => total + score / Math.pow(10, index + 1),
            0
          )
    : 0;
}

// This assignment is pretty arbitrary however it's mostly used for sorting
// entries where all we need to do is distinguish between the really common ones
// and the obscure academic ones.
//
// Entries with (P) are those ones that are marked with (P) in Edict.
const PRIORITY_ASSIGNMENTS: Map<string, number> = new Map([
  ['i1', 50], // Top 10,000 words minus i2 (from 1998) (P)
  ['i2', 20],
  ['n1', 40], // Top 12,000 words in newspapers (from 2003?) (P)
  ['n2', 20], // Next 12,000
  ['s1', 32], // "Speculative" annotations? Seem pretty common to me. (P)
  ['s2', 20], // (P)
  ['g1', 30], // (P)
  ['g2', 15],
]);

export function getPriorityScore(p: string): number {
  if (PRIORITY_ASSIGNMENTS.has(p)) {
    return PRIORITY_ASSIGNMENTS.get(p)!;
  }

  if (p.startsWith('nf')) {
    // The wordfreq scores are groups of 500 words.
    // e.g. nf01 is the top 500 words, and nf48 is the 23,501 ~ 24,000
    // most popular words.
    const wordfreq = parseInt(p.substring(2), 10);
    if (wordfreq > 0 && wordfreq < 48) {
      return 48 - wordfreq / 2;
    }
  }

  return 0;
}

// A variant on sortResultsByPriority that is useful for substring matching.
//
// We want to make sure exact matches sort first. So we have:
//
// * Find the matching entry (i.e. the one with matchRange set) and
//   get its full length.
//
//   Sort by the number of excess characters such that entries with
//   fewer excess characters sort first.
//
// * Then sort by priority value.
//
export function sortResultsByPriorityAndMatchLength(
  results: Array<WordResult>,
  searchLength: number
): Array<WordResult> {
  const sortMeta: Map<
    number,
    { excessChars: number | undefined; priority: number }
  > = new Map();

  for (const result of results) {
    const matchingHeadword =
      result.k.find((k) => k.matchRange) || result.r.find((r) => r.matchRange);
    const excessChars = matchingHeadword
      ? matchingHeadword.ent.length - searchLength
      : undefined;
    const priority = getPriority(result);
    sortMeta.set(result.id, { excessChars, priority });
  }

  results.sort((a, b) => {
    const metaA = sortMeta.get(a.id)!;
    const metaB = sortMeta.get(b.id)!;
    if (
      typeof metaA.excessChars !== 'undefined' &&
      typeof metaB.excessChars !== 'undefined' &&
      metaA.excessChars !== metaB.excessChars
    ) {
      return metaA.excessChars - metaB.excessChars;
    }
    return metaB.priority - metaA.priority;
  });

  return results;
}
