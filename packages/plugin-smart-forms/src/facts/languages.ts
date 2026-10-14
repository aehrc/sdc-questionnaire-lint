import type { ExpressionSite } from 'sdc-questionnaire-lint';
import {
  ANSWER_EXPRESSION,
  ANSWER_OPTIONS_TOGGLE_EXPRESSION,
  CALCULATED_EXPRESSION,
  CQF_EXPRESSION,
  ENABLE_WHEN_EXPRESSION,
  INITIAL_EXPRESSION,
  ITEM_POPULATION_CONTEXT,
  FHIRPATH,
  TARGET_CONSTRAINT,
  VARIABLE,
  X_FHIR_QUERY,
} from '../urls.js';
import {
  type Evidence,
  getExpressionsFromItem,
  inAppPopulateSource,
  populateLanguages,
  populateSource,
  type Reported,
  rendererSource,
  reported,
  reproduced,
  source,
} from './evidence.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// How a component handles the language of an Expression at a location it reads. Language checks
// are exact string comparisons.
// - fhirpath-only: it evaluates text/fhirpath and ignores any other language.
// - fhirpath-or-query: it evaluates text/fhirpath, runs exactly application/x-fhir-query as a
//   query, and ignores any other language.
// - any-as-fhirpath: it does not check the language, and evaluates the text as FHIRPath.
export type LanguageHandling = 'fhirpath-only' | 'fhirpath-or-query' | 'any-as-fhirpath';

// A location a component reads: the extension URL, plus the primitive element for cqf-expression.
export interface Location {
  readonly url: string;
  readonly element?: string;
}

export interface LanguageFact extends Reported {
  readonly location: Location;
  readonly handling: LanguageHandling;
  readonly evidence: readonly Evidence[];
}

// The aehrc/smart-forms issues that report a handling.
const upstream: Readonly<Partial<Record<LanguageHandling, readonly number[]>>> = {
  'any-as-fhirpath': [2164],
};

function fact(
  location: Location,
  handling: LanguageHandling,
  ...evidence: Evidence[]
): LanguageFact {
  return reported<LanguageFact>(
    Object.freeze({
      location: Object.freeze(location),
      handling,
      evidence: Object.freeze(evidence),
    }),
    upstream[handling],
  );
}

// The renderer reads root and item variables, the filtering locations, the unchecked
// targetConstraint and answerOptionsToggleExpression, and initialExpression only to repopulate. A
// location with no entry, such as candidateExpression or the root _title, is read by nothing.
const renderer140: readonly LanguageFact[] = Object.freeze([
  fact(
    { url: VARIABLE },
    'fhirpath-or-query',
    source(`${rendererSource}utils/questionnaireStoreUtils/extractVariables.ts`, 20, 77),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractOtherExtensions.ts`, 318, 329),
  ),
  fact({ url: CALCULATED_EXPRESSION }, 'fhirpath-only', source(getExpressionsFromItem, 137, 144)),
  fact({ url: ENABLE_WHEN_EXPRESSION }, 'fhirpath-only', source(getExpressionsFromItem, 48, 60)),
  // Evaluated only as a fallback when answerValueSet produced no codings.
  fact(
    { url: ANSWER_EXPRESSION },
    'fhirpath-only',
    source(getExpressionsFromItem, 178, 191),
    source(`${rendererSource}hooks/useValueSetCodings.ts`, 66, 124),
  ),
  ...['text', 'prefix', 'answerValueSet'].map((element) =>
    fact(
      { url: CQF_EXPRESSION, element },
      'fhirpath-only',
      source(getExpressionsFromItem, 78, 126),
      source(getExpressionsFromItem, 146, 152),
    ),
  ),
  // Read only to repopulate a form; no P1 rule uses it.
  fact({ url: INITIAL_EXPRESSION }, 'fhirpath-only', source(getExpressionsFromItem, 29, 41)),
  fact(
    { url: TARGET_CONSTRAINT },
    'any-as-fhirpath',
    source(`${rendererSource}utils/questionnaireStoreUtils/extractTargetConstraint.ts`, 11, 90),
    source(`${rendererSource}utils/targetConstraint.ts`, 68, 116),
  ),
  fact(
    { url: ANSWER_OPTIONS_TOGGLE_EXPRESSION },
    'any-as-fhirpath',
    source(getExpressionsFromItem, 198, 262),
    source(`${rendererSource}utils/answerOptionsToggleExpressions.ts`, 69, 122),
  ),
]);

const populate471: readonly LanguageFact[] = Object.freeze([
  // A query variable is fetched, on the root and on items alike.
  fact(
    { url: VARIABLE },
    'fhirpath-or-query',
    source(`${inAppPopulateSource}inputParameters.ts`, 143, 193),
    source(`${populateSource}createFhirPathContext.ts`, 272, 283),
    reproduced(
      populateLanguages,
      'populate 4.7.1 variables > evaluates a root text/fhirpath variable',
    ),
    reproduced(
      populateLanguages,
      'populate 4.7.1 variables > fetches a root application/x-fhir-query variable',
    ),
    reproduced(
      populateLanguages,
      'populate 4.7.1 variables > fetches an item application/x-fhir-query variable',
    ),
    reproduced(
      populateLanguages,
      'populate 4.7.1 variables > neither fetches nor evaluates a text/x-fhir-query variable',
    ),
    reproduced(
      populateLanguages,
      'populate 4.7.1 variables > neither fetches nor evaluates a text/cql variable',
    ),
  ),
  fact(
    { url: INITIAL_EXPRESSION },
    'any-as-fhirpath',
    source(`${populateSource}readPopulationExpressions.ts`, 108, 121),
    source(`${populateSource}evaluateExpressions.ts`, 49, 75),
    reproduced(
      populateLanguages,
      'populate 4.7.1 initialExpression > evaluates a text/cql initialExpression as FHIRPath',
    ),
    reproduced(
      populateLanguages,
      'populate 4.7.1 initialExpression > evaluates an application/x-fhir-query initialExpression as FHIRPath, which fails',
    ),
  ),
  fact(
    { url: ITEM_POPULATION_CONTEXT },
    'any-as-fhirpath',
    source(`${populateSource}readPopulationExpressions.ts`, 53, 63),
    source(`${populateSource}evaluateExpressions.ts`, 77, 102),
    reproduced(
      populateLanguages,
      'populate 4.7.1 itemPopulationContext > evaluates an application/x-fhir-query itemPopulationContext as FHIRPath, which fails',
    ),
  ),
]);

export const languageFacts: FactTable<readonly LanguageFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': renderer140 }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// How a component version handles the language at a site's location; undefined when it does not
// read the location.
export function languageFactAt(
  component: Component,
  version: string,
  site: ExpressionSite,
): LanguageFact | undefined {
  const url = site.location?.url;
  return factsAt(languageFacts, 'language', component, version).find(
    ({ location }) => location.url === url && location.element === site.element,
  );
}

// Whether a component that handles languages this way ignores an expression in the language.
export function ignores(handling: LanguageHandling, language: string): boolean {
  if (handling === 'any-as-fhirpath') return false;
  return language !== FHIRPATH && !(handling === 'fhirpath-or-query' && language === X_FHIR_QUERY);
}
