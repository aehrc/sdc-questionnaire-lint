import { findFunctionCalls, hasFhirPathText } from '../analysis/fhirpath.js';
import { fhirPathFunctions } from '../analysis/fhirpath-function-catalog.js';
import type { LintRule } from '../plugins/contract.js';
import { closestName } from '../suggest.js';

// Keyword operators are table keys, but name() does not parse when name is a keyword.
const keywordOperators: ReadonlySet<string> = new Set([
  'and',
  'or',
  'xor',
  'implies',
  'mod',
  'div',
]);

// The names an author can write as name(), so help never suggests an operator such as &.
const callableFunctions = [...fhirPathFunctions].filter(
  (name) => /^[A-Za-z_]\w*$/.test(name) && !keywordOperators.has(name),
);

const consequence = 'is not a FHIRPath function, so this expression fails when the form runs.';

function help(name: string): string {
  const similar = closestName(name, callableFunctions);
  return similar === undefined
    ? 'check the function name; see the FHIRPath function list'
    : `a function with a similar name exists: ${similar}()`;
}

export const unknownFunction: LintRule = {
  meta: {
    description: 'Reports a call to a function that fhirpath.js does not implement.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every function call in an expression whose language is text/fhirpath, or in a {{…}} ' +
        'fragment of an x-fhir-query, at a catalogued location or found elsewhere in the ' +
        'Questionnaire, is compared with the functions ' +
        'fhirpath.js 4.10.1 implements. Calls on %factory and %terminologies are not checked, ' +
        'because fhirpath.js resolves them against their own functions.',
      why:
        'fhirpath.js, the engine Smart Forms runs, fails on a call to a function it does not ' +
        'implement, even when the input is empty. The expression then always fails when the form ' +
        'runs: a calculated value is never filled in, or a question is never shown or hidden.',
      exampleMessage: `fist() ${consequence}`,
      fix:
        'Correct the function name in the FSH rule that sets the expression, then run SUSHI ' +
        'again. The help names a function with a similar name when there is one.',
      limitations:
        'A function in the FHIRPath specification that fhirpath.js does not implement is ' +
        'reported too. An expression that does not parse is left to sdc/parse-error. A similar ' +
        'name is suggested only within a small edit distance, so a swap of two letters in a ' +
        'short name, such as frist, gets no suggestion. A backtick-delimited name with an escape ' +
        'sequence is not checked.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (!hasFhirPathText(site)) continue;
      for (const { name, startOffset, endOffset } of findFunctionCalls(site.text) ?? []) {
        if (fhirPathFunctions.has(name)) continue;
        ctx.report({
          site,
          message: `${name}() ${consequence}`,
          help: help(name),
          range: { startOffset, endOffset },
        });
      }
    }
  },
};
