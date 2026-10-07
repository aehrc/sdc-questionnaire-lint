import { findFhirPathSyntaxProblem, hasFhirPathText } from '../analysis/fhirpath.js';
import type { LintRule } from '../plugins/contract.js';
import { syntaxFinding } from './parse-error.js';

export const fragmentParseError: LintRule = {
  meta: {
    description: 'Reports a FHIRPath expression embedded in an x-fhir-query that does not parse.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Each {{…}} fragment of an x-fhir-query, at a catalogued location or found elsewhere in ' +
        'the Questionnaire, is parsed as FHIRPath with fhirpath.js. A fragment that does not ' +
        'parse is reported in its query, at the position where the parser found the error.',
      why:
        'Smart Forms evaluates each fragment before it sends the query to the FHIR server. A ' +
        'fragment that does not parse leaves the query unresolved, so the fields it fills stay ' +
        'empty.',
      exampleMessage: 'The expression ends before it is complete.',
      fix:
        'Correct the FHIRPath between the braces in the FSH rule that sets the query, at the ' +
        'position the caret shows, then run SUSHI again.',
      limitations:
        'A fragment ends at the first }}, even one inside a FHIRPath string. Only syntax is ' +
        'checked: unknown functions are reported by sdc/unknown-function, and the query around ' +
        'the fragments by sdc/query-syntax.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (site.carrier !== 'fragment' || !hasFhirPathText(site)) continue;
      const problem = findFhirPathSyntaxProblem(site.text);
      if (problem !== undefined) ctx.report({ site, ...syntaxFinding(site.text, problem) });
    }
  },
};
