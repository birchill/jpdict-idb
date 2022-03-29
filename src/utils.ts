/**
 * A helper to strip certain fields from an object.
 */
export function stripFields<T extends object, K extends keyof T>(
  o: T,
  fields: K[]
): Omit<T, K> {
  const result: Partial<T> = { ...(<object>o) };
  for (const field of fields) {
    delete result[field];
  }
  return <Omit<T, K>>result;
}

/**
 * Like Partial, but scoped to the specified members.
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Pick<Partial<T>, K>;

export function isArrayOfStrings(a: any) {
  return (
    Array.isArray(a) &&
    (a as Array<any>).every((elem) => typeof elem === 'string')
  );
}

export function isArrayOfStringsOrNumbers(a: any) {
  return (
    Array.isArray(a) &&
    (a as Array<any>).every(
      (elem) => typeof elem === 'string' || typeof elem === 'number'
    )
  );
}

export function isFinitePositiveNumber(a: unknown): a is number {
  return typeof a === 'number' && (a as number) >= 0 && Number.isFinite(a);
}
