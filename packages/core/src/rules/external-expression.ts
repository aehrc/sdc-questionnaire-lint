import type { ExpressionSite } from '../analysis/expression-site.js';
import type { LintRule } from '../plugins/contract.js';

// Where the rule reports: an Expression whose content is only behind its reference.
function hasOnlyReference(site: ExpressionSite): site is ExpressionSite & { reference: string } {
  return site.carrier === 'expression' && site.text === undefined && site.reference !== undefined;
}

const message = (reference: string): string =>
  `This expression has no text, only the reference ${reference}, so it was not checked.`;

export const externalExpression: LintRule = {
  meta: {
    description: 'Reports an expression whose content is only behind a reference.',
    defaultSeverity: 'info',
    docs: {
      checks:
        'Looks for Expressions that have a reference but no expression text, such as CQL kept in ' +
        'a Library. Each one is reported once.',
      why:
        'The linter checks only the expression text in the Questionnaire. It does not follow the ' +
        'reference, so no rule checks this expression, and a clean run says nothing about it.',
      exampleMessage: message('#calculations'),
      fix:
        'Nothing to fix when the reference is intended. For the linter to check the expression, ' +
        'write its text in the expression element instead of the reference.',
      limitations:
        'The referenced content is never resolved or analysed, even when it is a Library ' +
        'contained in the Questionnaire. Outside recognised locations, an Expression must have ' +
        'a language to be found. An Expression with both text and a reference is checked by its ' +
        'text, and the reference is ignored; one with neither is not reported.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (hasOnlyReference(site)) ctx.report({ site, message: message(site.reference) });
    }
  },
};
