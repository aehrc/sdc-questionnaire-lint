import { findFhirPathSyntaxProblem } from '../analysis/fhirpath.js';
import { findQueryShapeProblem, hasQueryText, scanQuery } from '../analysis/query.js';
import type { LintRule, RuleFinding } from '../plugins/types.js';

const notASearch =
  "This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills " +
  'stay empty.';

// The finding for a query whose shape is wrong: FHIRPath marked as a query gets the language fix.
function shapeFinding(text: string): Omit<RuleFinding, 'site'> {
  return {
    message: notASearch,
    help:
      findFhirPathSyntaxProblem(text) === undefined
        ? 'set the language to text/fhirpath; this expression is FHIRPath'
        : 'write a FHIR search such as Observation?subject={{%patient.id}}',
  };
}

// The finding for a {{ with no }}, over the braces.
function unclosedFinding(text: string): Omit<RuleFinding, 'site'> {
  const at = scanQuery(text).unclosedAt;
  if (at === undefined) throw new Error(`The query has no unclosed {{: ${text}`);
  return {
    message:
      'This x-fhir-query has a {{ with no closing }}, so the text after it is sent to the ' +
      'server as written instead of being evaluated.',
    help: 'add }} after the embedded FHIRPath expression',
    range: { startOffset: at, endOffset: at + 2 },
  };
}

export const querySyntax: LintRule = {
  meta: {
    description: 'Reports an x-fhir-query that is not a FHIR search.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Each x-fhir-query expression with text, at a catalogued location or found elsewhere in ' +
        'the Questionnaire, must start like a FHIR search: a resource type, a {{…}} fragment, ' +
        '?, $, _, or an absolute http:// or https:// URL. Every {{ must have a closing }}.',
      why:
        'Smart Forms sends the query to the FHIR server as a request. FHIRPath marked as ' +
        'x-fhir-query, for example, makes the request fail, and the fields it fills stay empty ' +
        'with no clear error.',
      exampleMessage: notASearch,
      fix:
        'If the expression is FHIRPath, set its language to text/fhirpath in the FSH rule. ' +
        'Otherwise write it as a FHIR search, with FHIRPath only inside {{…}}. Then run SUSHI ' +
        'again.',
      limitations:
        'The check is deliberately lenient, so that no real query is reported. Resource type ' +
        'names and search parameters are not validated: a name that starts with a lower-case ' +
        'letter is the only resource type mistake it catches. A query with an unclosed {{ gets ' +
        'only that finding.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (!hasQueryText(site)) continue;
      const problem = findQueryShapeProblem(site.text);
      if (problem === 'unclosed') ctx.report({ site, ...unclosedFinding(site.text) });
      if (problem === 'not-a-search') ctx.report({ site, ...shapeFinding(site.text) });
    }
  },
};
