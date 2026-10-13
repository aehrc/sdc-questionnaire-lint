import {
  type Evidence,
  inAppPopulateSource,
  populateSource,
  populateVariableStorage,
  rendererSource,
  reproduced,
  source,
} from './evidence.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// How a component stores the names a form declares, and when it evaluates item variables
// (docs/smart-forms-rules.md, Variable storage and order).
// - one-value-per-name: one value per name for the whole form, whichever element declares it, so a
//   later evaluation of a name declared on another element replaces it: a root and an item
//   variable, two items' variables, a FHIRPath variable and a query variable or a sourceQueries
//   result. Items are evaluated children first, so an ancestor's value reaches a descendant.
// - population-context-stored-by-name: an itemPopulationContext that population reads stores its
//   value under its name, after the variables, so it replaces a variable of the name; of two with
//   one name, only the last one's expression is evaluated, and every group whose children read the
//   name is built from its values.
// - launch-context-named-by-position: a root launchContext with a name sub-extension that has a
//   valueId or a valueCoding.code, and a type sub-extension with a valueCode, stores its resource
//   under the name its first sub-extension gives: valueId, else valueCoding.code.
// - item-variable-per-response-item: an item variable is evaluated once for each response item of
//   its item's linkId, in document order, and keeps the last value, so a variable on or below a
//   repeating group keeps one repetition's value.
// - item-variable-once: an item variable is evaluated once, with an empty input.
export type VariableBehaviour =
  | 'one-value-per-name'
  | 'population-context-stored-by-name'
  | 'launch-context-named-by-position'
  | 'item-variable-per-response-item'
  | 'item-variable-once';

export interface VariableFact {
  readonly behaviour: VariableBehaviour;
  readonly evidence: readonly Evidence[];
}

function fact(behaviour: VariableBehaviour, ...evidence: Evidence[]): VariableFact {
  return Object.freeze({ behaviour, evidence: Object.freeze(evidence) });
}

const fhirpathUtils = `${rendererSource}utils/fhirpath.ts`;

const renderer140: readonly VariableFact[] = Object.freeze([
  fact('one-value-per-name', source(fhirpathUtils, 94, 149), source(fhirpathUtils, 193, 237)),
  fact(
    'item-variable-per-response-item',
    source(fhirpathUtils, 217, 236),
    source(fhirpathUtils, 268, 289),
  ),
]);

const context = `${populateSource}createFhirPathContext.ts`;
const suite = 'populate 4.7.1 variable storage > ';
const test = (name: string): Evidence => reproduced(populateVariableStorage, `${suite}${name}`);
const launchTest = (name: string): Evidence =>
  reproduced(populateVariableStorage, `populate 4.7.1 launchContext names > ${name}`);

const populate471: readonly VariableFact[] = Object.freeze([
  fact(
    'one-value-per-name',
    source(context, 68, 153),
    test('keeps one value for a name declared on the root and on an item'),
    test(
      'keeps one value for a name declared on two sibling items, the later linkId in key order winning',
    ),
    test(
      'gives the expressions of an inner item the value of an outer item that declares the same name',
    ),
    test(
      'replaces the launch Patient with an item variable named patient, in populatedContext too',
    ),
    test('replaces an application/x-fhir-query variable with a FHIRPath variable of the same name'),
    test('replaces a contained sourceQueries Bundle with a FHIRPath variable of the same name'),
  ),
  fact(
    'population-context-stored-by-name',
    source(`${populateSource}evaluateExpressions.ts`, 126, 153),
    test('replaces a variable with an itemPopulationContext of the same name'),
    test(
      'builds both groups of two itemPopulationContexts with one name from the values of the last one',
    ),
  ),
  fact(
    'launch-context-named-by-position',
    source(`${inAppPopulateSource}inputParameters.ts`, 97, 121),
    source(`${inAppPopulateSource}inputParameters.ts`, 338, 374),
    launchTest('binds a launchContext named by valueId'),
    launchTest(
      'reads the name from the first sub-extension, so a launchContext written type-first binds nothing',
    ),
    launchTest('prefers valueId to valueCoding.code in the first sub-extension'),
  ),
  fact(
    'item-variable-once',
    source(context, 141, 153),
    test('evaluates an item variable on a repeating group once, against an empty input'),
  ),
]);

export const variableFacts: FactTable<readonly VariableFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': renderer140 }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// The variable facts of a component version, by behaviour.
export function variablesAt(
  component: Component,
  version: string,
): ReadonlyMap<VariableBehaviour, VariableFact> {
  return new Map(
    factsAt(variableFacts, 'variable', component, version).map((each) => [each.behaviour, each]),
  );
}
