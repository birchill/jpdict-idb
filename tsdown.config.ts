import type { UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  fixedExtension: false,
  sourcemap: true,
});

export default config;
