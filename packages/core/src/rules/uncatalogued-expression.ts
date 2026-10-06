import { FHIRPATH } from '../analysis/fhirpath.js';
import { X_FHIR_QUERY } from '../analysis/query.js';
import type { LintRule } from '../plugins/types.js';

const unrecognised = 'This expression is in a place the linter does not recognise';
const fhirPathMessage = `${unrecognised}, so only its FHIRPath syntax and function names can be checked.`;
const queryMessage = `${unrecognised}, so only its query shape and the FHIRPath in its {{…}} fragments can be checked.`;

// What can still be checked in an uncatalogued expression, by its language.
function messageFor(language: string | undefined): string {
  if (language === FHIRPATH) return fhirPathMessage;
  if (language === X_FHIR_QUERY) return queryMessage;
  return `${unrecognised}, so it was not checked.`;
}

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
        'sdc/parse-error and sdc/unknown-function, or for an x-fhir-query the shape check of ' +
        'sdc/query-syntax and the checks of its fragments by sdc/fragment-parse-error and ' +
        'sdc/unknown-function. An expression in another language gets no check, so a clean run ' +
        'says nothing else about it.',
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
      ctx.report({ site, message: messageFor(site.language) });
    }
  },
};
