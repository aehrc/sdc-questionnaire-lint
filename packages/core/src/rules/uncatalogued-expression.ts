import { FHIRPATH } from '../analysis/fhirpath.js';
import type { LintRule } from '../plugins/types.js';

const unrecognised = 'This expression is in a place the linter does not recognise';
const fhirPathMessage = `${unrecognised}, so only its FHIRPath syntax and function names can be checked.`;

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
        'Any other expression gets at most the FHIRPath syntax and function checks of ' +
        'sdc/parse-error and sdc/unknown-function, and an expression in another language gets no ' +
        'check, so a clean run says nothing else about it.',
      exampleMessage: fhirPathMessage,
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
      // A query is reported once, not once per fragment.
      if (site.catalogued || site.carrier !== 'expression') continue;
      ctx.report({
        site,
        message:
          site.language === FHIRPATH ? fhirPathMessage : `${unrecognised}, so it was not checked.`,
      });
    }
  },
};
