import typescript from '@rollup/plugin-typescript';

const external = [
  '@birchill/json-equalish',
  '@birchill/normal-jp',
  'idb/with-async-ittr',
];

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({
        outDir: 'dist/esm',
      }),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs',
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({
        declaration: false,
      }),
    ],
  },
];
