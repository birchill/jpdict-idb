/**
 * Intersection of T & U but with the types of U being used where they overlap.
 */
export type Overwrite<T, U> = Omit<T, Extract<keyof T, keyof U>> & U;

/* eslint @typescript-eslint/ban-types: 0 */
export type Resolve<T> = T extends Function ? T : { [K in keyof T]: T[K] };
