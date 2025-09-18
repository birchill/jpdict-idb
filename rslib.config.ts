import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      dts: {
        bundle: true,
      },
    },
    {
      format: 'esm',
      dts: {
        bundle: true,
      },
    },
  ],
  source: {
    entry: { index: './src/index.ts' },
  },
  output: {
    cleanDistPath: true,
    sourceMap: true,
  },
});
