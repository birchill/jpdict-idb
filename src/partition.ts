/**
 * Partitions an array into two arrays - one of all the elements that pass the
 * given test and another of all those that fail it.
 */
export function partition<T>(
  array: ReadonlyArray<T>,
  test: (elem: T) => boolean
): [pass: Array<T>, fail: Array<T>] {
  return array.reduce<[pass: Array<T>, fail: Array<T>]>(
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
