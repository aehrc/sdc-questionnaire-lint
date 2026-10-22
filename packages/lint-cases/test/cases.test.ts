import { lint } from '@aehrc/sdc-questionnaire-lint';
import { lintCases, testLintCases } from '../src/cases.js';
import fixture from './fixture-plugin/index.js';

// A plugin's cases, linted by the built core with the plugin's source listed in every case's
// linter config.
const cases = lintCases({
  casesDirectory: new URL('cases/', import.meta.url),
  lint,
  plugins: [new URL('fixture-plugin/index.ts', import.meta.url)],
});

testLintCases(cases, fixture);
