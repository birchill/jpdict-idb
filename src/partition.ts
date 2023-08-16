/**
 * Partitions an array into two arrays - one of all the elements that pass the
 * given test and another of all those that fail it.
 */
export function partition<T>(
  array: readonly T[],
  test: (elem: T) => boolean
): [pass: T[], fail: T[]] {
  return array.reduce<[pass: T[], fail: T[]]>(
    (acc, elem) => {
      const [pass, fail] = acc;

      if (test(elem)) {
        pass.push(elem);
      } else {
        fail.push(elem);
      }

      return acc;
    },
    [[], []]
  );
}
