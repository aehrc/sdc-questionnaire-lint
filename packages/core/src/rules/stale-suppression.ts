import type { LintRule, RuleFinding } from '../plugins/types.js';

type Described = Pick<RuleFinding, 'message' | 'help'> & { help: string };

const removeEntry = 'remove this entry from suppress';
const hidesNothing = 'hides nothing: the rule checked this expression and found no problem.';

// The suppression's file was confirmed not to exist in a full run.
export function fileGone(rule: string, file: string): Described {
  return {
    message: `A suppression of ${rule} targets ${file}, which no longer exists.`,
    help: removeEntry,
  };
}

// The file was selected, but no Expression in it matches the selectors.
export function siteGone(rule: string, file: string): Described {
  return {
    message: `A suppression of ${rule} matches no expression in ${file}.`,
    help:
      "remove this entry, or update its selectors to the expression's current linkId, " +
      'extensionUrl or name',
  };
}

// The rule completed its check at the selected Expression and reported nothing.
export function nothingToHide(rule: string): Described {
  return { message: `A suppression of ${rule} ${hidesNothing}`, help: removeEntry };
}

// Registered next to the sdc rules so it can be configured and explained. Its findings come from
// the suppression assessment (run/suppressions.ts), not from check.
export const staleSuppression: LintRule = {
  meta: {
    description: 'Reports a suppression that is no longer needed.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'Each entry of suppress in the config is assessed after the rules run. It is stale when ' +
        'its file no longer exists in a full run, when no expression in its selected file ' +
        'matches its selectors, or when its rule checked the selected expression and reported ' +
        'nothing. The finding points at the entry in the config, such as /suppress/0.',
      why:
        'A suppression that hides nothing still reads as a known problem, and it would silently ' +
        'hide a new finding of the same rule at that expression later.',
      exampleMessage: `A suppression of sdc/parse-error ${hidesNothing}`,
      fix:
        'Remove the entry from suppress. If the expression moved, update its selectors to the ' +
        "expression's current linkId, extensionUrl or name instead.",
      limitations:
        'An entry is reported only when the run establishes that it is unnecessary. A file ' +
        'outside a targeted run, an existing file outside the configured files, and a rule that ' +
        'is off or could not check the expression leave the entry not assessed. The setting ' +
        'can be warning or off; with off, staleness is not assessed. Findings of this rule ' +
        'cannot themselves be suppressed.',
    },
  },
  check: () => undefined,
};
