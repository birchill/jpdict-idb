import typescript from '@rollup/plugin-typescript';
import cleaner from 'rollup-plugin-cleaner';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
    },
    external: [
      '@birchill/json-equalish',
      '@birchill/normal-jp',
      'idb/with-async-ittr',
      'safari-14-idb-fix',
      'superstruct',
    ],
    plugins: [cleaner({ targets: ['dist/'] }), typescript({ outDir: 'dist' })],
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
];
