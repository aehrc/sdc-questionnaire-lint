import { lintCases, testLintCases } from '@sdc-questionnaire-lint/lint-cases';
import { lint } from 'sdc-questionnaire-lint';
import smartForms from '../../src/index.js';

// Each case is a YAML config beside the findings the linter must report for it, linted by the
// built core with the plugin's source listed in every case's linter config. Run
// `npx vitest run -u test/cases` to write the expected files, then review them.
testLintCases(
  lintCases({
    casesDirectory: new URL('./', import.meta.url),
    lint,
    plugins: [new URL('../../src/index.ts', import.meta.url)],
  }),
  smartForms,
);
