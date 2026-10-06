import { FHIRPATH } from '../analysis/fhirpath.js';
import type { LintRule } from '../plugins/types.js';

const unrecognised = 'This expression is in a place the linter does not recognise';

export const uncataloguedExpression: LintRule = {
  meta: {
    description: 'Reports an expression in a place the linter does not recognise.',
    defaultSeverity: 'info',
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (site.catalogued) continue;
      ctx.report({
        site,
        message:
          site.language === FHIRPATH
            ? `${unrecognised}, so only its FHIRPath syntax was checked.`
            : `${unrecognised}, so it was not checked.`,
      });
    }
  },
};
