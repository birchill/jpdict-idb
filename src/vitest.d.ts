import 'vitest';

interface CustomMatchers<R = unknown> {
  toBeWithinRange: (start: Date, end: Date) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<T = any> extends CustomMatchers<T> {}
}
