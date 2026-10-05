import type { LintRule, RuleFinding } from '../plugins/types.js';

// The message and help of a stale suppression whose target file no longer exists.
export function describeDeletedTarget(target: string): Pick<RuleFinding, 'message' | 'help'> {
  return {
    message: `A suppression targets ${target}, which no longer exists.`,
    help: 'remove this suppression from the configuration',
  };
}

// Reported while suppressions are assessed (run/suppressions.ts), so check never runs per
// Questionnaire.
export const staleSuppression: LintRule = {
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
      exampleMessage: describeDeletedTarget('fsh-generated/resources/Questionnaire-Deleted.json')
        .message,
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
};
