import {
  type Evidence,
  populateNames,
  populateSource,
  rendererSource,
  reproduced,
  source,
} from './evidence.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// A name a component does not supply to the expressions it evaluates, although SDC defines it.
// fhirpath.js fails on a reference to it when the reference is evaluated, and the component
// catches the failure. P4 adds the sourceQueries names population supplies to this file.
export interface NameFact {
  readonly name: string;
  readonly evidence: readonly Evidence[];
}

function unsupplied(name: string, ...evidence: Evidence[]): NameFact {
  return Object.freeze({ name, evidence: Object.freeze(evidence) });
}

// The renderer's context is the previous context, the response as %resource and %rootResource,
// the query variable names and the variables; a host's additionalContext is the only other source
// (fhirpath.ts:193-197, questionnaireStore.ts:244-267).
const rendererContext = [
  source(`${rendererSource}utils/fhirpath.ts`, 193, 197),
  source(`${rendererSource}stores/questionnaireStore.ts`, 244, 267),
];

const renderer140: readonly NameFact[] = Object.freeze([
  unsupplied('questionnaire', ...rendererContext),
  unsupplied('qitem', ...rendererContext),
]);

const populateContext = source(`${populateSource}createFhirPathContext.ts`, 68, 71);
const names = 'populate 4.7.1 does not supply %questionnaire or %qitem > ';

const populate471: readonly NameFact[] = Object.freeze([
  unsupplied(
    'questionnaire',
    populateContext,
    reproduced(
      populateNames,
      `${names}fails a root variable that uses %questionnaire, and the initialExpression that uses it`,
    ),
    reproduced(
      populateNames,
      `${names}fails an itemPopulationContext that uses %questionnaire, so the group is absent`,
    ),
  ),
  unsupplied(
    'qitem',
    populateContext,
    reproduced(
      populateNames,
      `${names}fails an item variable that uses %qitem, and the initialExpression that uses it`,
    ),
    reproduced(populateNames, `${names}fails an initialExpression that uses %qitem`),
  ),
]);

export const unsuppliedNames: FactTable<readonly NameFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': renderer140 }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// The names a component version does not supply.
export function unsuppliedAt(component: Component, version: string): ReadonlySet<string> {
  return new Set(factsAt(unsuppliedNames, 'name', component, version).map(({ name }) => name));
}
