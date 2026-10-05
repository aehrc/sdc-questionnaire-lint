import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli/main.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // tsup sets baseUrl for its declaration build, which TypeScript 6 deprecates.
  dts: { entry: { index: 'src/index.ts' }, compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
});
