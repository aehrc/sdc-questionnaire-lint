import pkg from '../../package.json' with { type: 'json' };
import { parseError } from '../rules/parse-error.js';
import { staleSuppression } from '../rules/stale-suppression.js';
import { unregisteredExpression } from '../rules/unregistered-expression.js';
import type { LintPlugin } from './types.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {
    'parse-error': parseError,
    'unregistered-expression': unregisteredExpression,
  },
};

// The reserved lint namespace: findings about the linter's own configuration. Its rules report
// outside the per-Questionnaire rule run. Not listed in run.plugins.
export const lintPlugin: LintPlugin = {
  meta: { name: 'lint', version: pkg.version },
  rules: {
    'stale-suppression': staleSuppression,
  },
};
