import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium', headless: true },
        { browser: 'firefox', headless: true },
        { browser: 'webkit', headless: true },
      ],
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
