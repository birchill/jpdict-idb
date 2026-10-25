import type { ViteUserConfig } from 'vitest/config';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const config: ViteUserConfig = defineConfig({
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

export default config;
