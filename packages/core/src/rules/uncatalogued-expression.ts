import { FHIRPATH } from '../analysis/fhirpath.js';
import type { LintRule } from '../plugins/types.js';

const unrecognised = 'This expression is in a place the linter does not recognise';

export const uncataloguedExpression: LintRule = {
  meta: {
    description: 'Reports an expression in a place the linter does not recognise.',
    defaultSeverity: 'info',
    docs: {
      checks:
        'Looks for expressions, objects with a language and an expression, outside the locations ' +
        'the linter recognises: for example in a custom extension, on an answerOption or inside a ' +
        'contained resource. Each one is reported once.',
      why:
        'The linter knows how a recognised location is used, such as for rendering or population. ' +
        'For any other expression it checks FHIRPath syntax at most, and expressions in other ' +
        'languages not at all, so a clean run says nothing else about it.',
      exampleMessage: `${unrecognised}, so only its FHIRPath syntax was checked.`,
      fix:
        'Nothing to fix when the location is intended. If the expression belongs in an SDC ' +
        'extension, move it there, for example from a misspelt extension URL to the correct one.',
      limitations:
        'Only Expression objects are detected; FHIRPath held in a plain string is not. Contained ' +
        'resources are always treated as unrecognised.',
    },
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
