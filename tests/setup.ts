import { expect } from 'vitest';

expect.extend({
  toBeWithinRange(received: Date, start: Date, end: Date) {
    const pass =
      received.getTime() >= start.getTime() &&
      received.getTime() <= end.getTime();

    return {
      pass,
      message: () =>
        `expected ${received.toISOString()} to be within range ${start.toISOString()} – ${end.toISOString()}`,
    };
  },
});
