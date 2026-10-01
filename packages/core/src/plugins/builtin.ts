import pkg from '../../package.json' with { type: 'json' };
import type { LintPlugin } from './types.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {},
};

// The reserved lint namespace: findings about the linter's own configuration. The runner reports
// these itself while assessing suppressions, so check never runs per Questionnaire. Not listed in
// run.plugins.
export const lintPlugin: LintPlugin = {
  meta: { name: 'lint', version: pkg.version },
  rules: {
    'stale-suppression': {
      meta: {
        description: 'Reports a suppression that the run establishes is no longer needed.',
        defaultSeverity: 'warning',
      },
      check: () => undefined,
    },
  },
};
