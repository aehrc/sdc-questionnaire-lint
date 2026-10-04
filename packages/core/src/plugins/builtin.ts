import pkg from '../../package.json' with { type: 'json' };
import { parseError } from '../rules/parse-error.js';
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
        docs: {
          checks:
            'Each entry in the config suppress array. An entry is stale when the run establishes ' +
            'that it is no longer needed: the input file it names was deleted, its resource or ' +
            'expression site was removed, or the suppressed rule completed its check on that site ' +
            'without a finding.',
          why:
            'A stale suppression hides nothing today, but it would silently hide a new finding at ' +
            'the same place later. Removing it keeps the list of accepted exceptions accurate.',
          exampleMessage:
            'A suppression targets fsh-generated/resources/Questionnaire-Deleted.json, which no ' +
            'longer exists.',
          fix:
            'Remove the entry from the suppress array. If the file or item was renamed, update the ' +
            'entry to the new file or linkId instead.',
          limitations:
            'Only assessed suppressions can be stale. A targeted run does not assess suppressions ' +
            'for files outside its selection, and a full run does not assess an existing file ' +
            'outside its configured inputs. A suppressed rule configured off, or an analysis that ' +
            'is unavailable, also leaves the entry not assessed.',
        },
      },
      check: () => undefined,
    },
  },
};
