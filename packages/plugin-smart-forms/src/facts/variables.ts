import {
  type Evidence,
  inAppPopulateSource,
  populateEvaluationOrder,
  populatePrerequisites,
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
//   result. An ancestor's value reaches a descendant, because population evaluates items in the
//   order population-evaluation-order gives, an item after its child items.
// - population-context-stored-by-name: an itemPopulationContext that population reads stores its
//   value under its name, after the variables, so it replaces a variable of the name; of two with
//   one name, only the last one's expression is evaluated, and every group whose children read the
//   name is built from its values.
// - launch-context-named-by-position: a root launchContext with a name sub-extension that has a
//   valueId or a valueCoding.code, and a type sub-extension with a valueCode, stores its resource
//   under the name its first sub-extension gives: valueId, else valueCoding.code. The resource type
//   is its second sub-extension's valueCode, so without one it stores nothing.
// - item-variable-per-response-item: an item variable is evaluated once for each response item of
//   its item's linkId, in document order, and keeps the last value, so a variable on or below a
//   repeating group keeps one repetition's value.
// - item-variable-once: an item variable is evaluated once, with an empty input.
// - named-expression-not-stored: a named Expression other than a variable or an
//   itemPopulationContext, such as a named calculatedExpression, stores no name, so a reference to
//   it fails unless another declaration or a sourceQueries result supplies the name.
// - item-fhirpath-variable-needs-root-extensions: item text/fhirpath variables are evaluated only
//   when the root has extensions.
// - additional-context-reaches-expressions: the names a host passes as additionalContext, which the
//   app fills with population's context, reach every expression the renderer evaluates except an
//   answerExpression (S14).
// - answer-expression-head-only: an answerExpression is evaluated with one name, the text between
//   its first % and its first ., and only when that names a launch context the SMART launch
//   supplies or an application/x-fhir-query variable whose ValueSet expanded; with no other name.
//   Of two such variables with one ValueSet URL, only the later one, root variables first and an
//   item's after its child items', gets the expansion.
// - population-evaluation-order: population binds names in five steps: the launch resources, the
//   sourceQueries results and the application/x-fhir-query variables with a name and expression
//   text; root text/fhirpath variables in array order; item text/fhirpath variables, only when the
//   root has extensions, by linkId in a plain object filled in post-order for every item with an
//   extension property, read in Object.keys order (integer-like linkIds first, ascending, then the
//   others in insertion order), each item's in array order; the itemPopulationContexts population
//   reads; then initialExpressions. A later item with a duplicate linkId keeps the first one's
//   position and replaces its variables when it has an extension property. A reference to a name
//   not yet bound fails with an OperationOutcome warning and leaves the variable unset; one to a
//   name bound earlier silently reads that value. fhirpath.js skips an iif branch, a coalesce
//   argument after a non-empty one and a predicate over an empty collection, so a reference there
//   need not fail. The variables of an item whose linkId is __proto__ are never evaluated, and a
//   response item with that linkId fails population altogether.
// - population-needs-input: population runs only when the form has a root launchContext with name
//   and type sub-extensions, found by URL, a root sourceQueries with a valueReference, or an
//   application/x-fhir-query variable with a name and expression text on the root or an item, and
//   its subjectType is empty or includes Patient.
// - stale-forward-read: the renderer evaluates variables from {} on its first pass, so a reference
//   to a variable evaluated later fails and is caught with a console warning; after additionalContext
//   is merged, later passes read the previous pass's value, so the variable may recover with a stale
//   value.
export type VariableBehaviour =
  | 'one-value-per-name'
  | 'population-context-stored-by-name'
  | 'launch-context-named-by-position'
  | 'item-variable-per-response-item'
  | 'item-variable-once'
  | 'named-expression-not-stored'
  | 'item-fhirpath-variable-needs-root-extensions'
  | 'additional-context-reaches-expressions'
  | 'answer-expression-head-only'
  | 'population-evaluation-order'
  | 'population-needs-input'
  | 'stale-forward-read';

export interface VariableFact {
  readonly behaviour: VariableBehaviour;
  readonly evidence: readonly Evidence[];
}

function fact(behaviour: VariableBehaviour, ...evidence: Evidence[]): VariableFact {
  return Object.freeze({ behaviour, evidence: Object.freeze(evidence) });
}

const fhirpathUtils = `${rendererSource}utils/fhirpath.ts`;

const renderer140: readonly VariableFact[] = Object.freeze([
  // An application/x-fhir-query variable's name is preset to [], with or without text.
  fact(
    'one-value-per-name',
    source(fhirpathUtils, 94, 149),
    source(fhirpathUtils, 193, 253),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractVariables.ts`, 20, 77),
  ),
  fact(
    'item-variable-per-response-item',
    source(fhirpathUtils, 217, 236),
    source(fhirpathUtils, 268, 289),
  ),
  // Only variables are collected; no other named Expression and no itemPopulationContext.
  fact(
    'named-expression-not-stored',
    source(`${rendererSource}utils/questionnaireStoreUtils/extractVariables.ts`, 48, 77),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractOtherExtensions.ts`, 318, 329),
  ),
  fact(
    'additional-context-reaches-expressions',
    source(`${rendererSource}stores/questionnaireStore.ts`, 244, 267),
  ),
  fact(
    'answer-expression-head-only',
    source(`${rendererSource}hooks/useValueSetCodings.ts`, 66, 112),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractLaunchContext.ts`, 5, 20),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractVariables.ts`, 22, 38),
    source(`${rendererSource}utils/questionnaireStoreUtils/extractOtherExtensions.ts`, 190, 201),
    source(`${rendererSource}utils/valueSet.ts`, 39, 40),
    source(`${rendererSource}utils/valueSet.ts`, 184, 213),
    source(`${rendererSource}utils/questionnaireStoreUtils/resolveValueSets.ts`, 37, 66),
  ),
  fact(
    'stale-forward-read',
    source(fhirpathUtils, 193, 197),
    source(fhirpathUtils, 295, 297),
    source(`${rendererSource}utils/calculatedExpression.ts`, 838, 856),
    source(`${rendererSource}stores/questionnaireStore.ts`, 267, 267),
    source(`${rendererSource}utils/manageForm.ts`, 144, 144),
    source(`${rendererSource}utils/questionnaireStoreUtils/createQuestionnaireModel.ts`, 130, 153),
  ),
]);

const context = `${populateSource}createFhirPathContext.ts`;
const suite = 'populate 4.7.1 variable storage > ';
const test = (name: string): Evidence => reproduced(populateVariableStorage, `${suite}${name}`);
const launchTest = (name: string): Evidence =>
  reproduced(populateVariableStorage, `populate 4.7.1 launchContext names > ${name}`);
const unavailableTest = (name: string): Evidence =>
  reproduced(
    populateVariableStorage,
    `populate 4.7.1 names a form does not make available > ${name}`,
  );

const orderTest = (name: string): Evidence =>
  reproduced(populateEvaluationOrder, `populate 4.7.1 evaluation order > ${name}`);
const duplicateTest = (name: string): Evidence =>
  reproduced(
    populateEvaluationOrder,
    `populate 4.7.1 evaluation order with duplicate linkIds > ${name}`,
  );
const environmentTest = (name: string): Evidence =>
  reproduced(populatePrerequisites, `populate 4.7.1 environment > ${name}`);
const inputParameters = `${inAppPopulateSource}inputParameters.ts`;

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
    test(
      'keeps one value for a name declared on two sibling items, the later linkId in document order winning when neither is integer-like',
    ),
    unavailableTest(
      'gives a reference to a named expression the value of a contained sourceQueries Bundle of its name',
    ),
    unavailableTest(
      'binds a variable beside a named calculatedExpression of the same name on one item',
    ),
  ),
  fact(
    'population-context-stored-by-name',
    source(`${populateSource}evaluateExpressions.ts`, 126, 153),
    test('replaces a variable with an itemPopulationContext of the same name'),
    test(
      'builds both groups of two itemPopulationContexts with one name from the values of the last one',
    ),
    unavailableTest('stores no name for an itemPopulationContext on the root'),
    unavailableTest('stores no name for an itemPopulationContext on an item with no child items'),
    unavailableTest(
      'stores no name for an itemPopulationContext on a group with an empty item array',
    ),
    unavailableTest('stores no name for an itemPopulationContext after another on its item'),
    unavailableTest('stores no name for an itemPopulationContext without expression text'),
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
    launchTest(
      'reads the resource type from the second sub-extension, so a description before the type binds nothing',
    ),
  ),
  fact(
    'item-variable-once',
    source(context, 141, 153),
    test('evaluates an item variable on a repeating group once, against an empty input'),
  ),
  fact(
    'named-expression-not-stored',
    source(context, 68, 153),
    unavailableTest('stores no name for a named initialExpression'),
    unavailableTest('stores no name for a named calculatedExpression'),
    unavailableTest('stores no name for a named itemExtractionContext'),
  ),
  fact(
    'item-fhirpath-variable-needs-root-extensions',
    source(context, 126, 128),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 environment > skips item FHIRPath variables when the root has no extensions',
    ),
  ),
  fact(
    'population-evaluation-order',
    source(context, 68, 153),
    source(context, 194, 214),
    source(context, 250, 264),
    source(`${populateSource}populate.ts`, 81, 111),
    source(`${populateSource}readPopulationExpressions.ts`, 53, 63),
    source(`${populateSource}evaluateExpressions.ts`, 126, 153),
    orderTest(
      'fails a root variable that reads a later root variable, and leaves a dependent initialExpression empty',
    ),
    orderTest('fails an item variable that reads a later variable on the same item'),
    orderTest('gives a variable the value of an earlier variable on the same item'),
    orderTest(
      'fails a child that reads the variable of a group later in key order: g/a, 2/1 and 10/2',
    ),
    orderTest(
      'gives a child the variable of an integer-like group earlier in key order: 1/a and 1/1.1',
    ),
    orderTest('fails a grandchild that reads the variable of its grandparent'),
    orderTest(
      'fails a variable that reads an itemPopulationContext, evaluated after every variable',
    ),
    orderTest('does not fail a later variable in an iif branch, but fails it in the criterion'),
    orderTest('does not fail a later variable in a coalesce argument after a non-empty one'),
    orderTest('does not fail a later variable in a where over %resource, the empty response'),
    orderTest(
      'fails a later variable in an and operand, a combine argument and a defineVariable value',
    ),
    orderTest(
      'gives a reference the value of a root variable of its name instead of a later item variable',
    ),
    orderTest(
      'gives a reference the launch resource of a launchContext of its name instead of a later variable',
    ),
    orderTest(
      'gives a reference a contained sourceQueries Bundle of its name instead of a later variable',
    ),
    orderTest(
      'binds an application/x-fhir-query variable before every FHIRPath variable, on the root and on an item',
    ),
    orderTest(
      'does not fail a reference to an Object property name, which fhirpath.js finds with in',
    ),
    duplicateTest(
      'replaces the variables of an item with those of a later item with its linkId, at the position of the first',
    ),
    duplicateTest('replaces them with none when the later item has an empty extension array'),
    duplicateTest('keeps them when the later item has no extension property'),
    duplicateTest('never evaluates the variables of an item whose linkId is __proto__'),
    duplicateTest('fails population when the response gets an item whose linkId is __proto__'),
  ),
  fact(
    'population-needs-input',
    source(inputParameters, 66, 76),
    source(inputParameters, 96, 180),
    source(inputParameters, 293, 303),
    source(`${inAppPopulateSource}populateQuestionnaire.ts`, 109, 125),
    environmentTest(
      'does not populate a form with no launchContext, sourceQueries or query variable',
    ),
    environmentTest('populates a form whose only input is a query variable'),
    environmentTest('populates a form whose only input is a sourceQueries reference'),
    environmentTest('populates a form whose only input is an item query variable'),
    environmentTest(
      'populates a form whose launchContext has its name and type found by URL, whatever their order',
    ),
    environmentTest(
      'does not populate a form with a query variable without text, or a launchContext without a type',
    ),
    environmentTest('does not populate a form whose subjectType lacks Patient'),
  ),
]);

export const variableFacts: FactTable<readonly VariableFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': renderer140 }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// The variable facts of a component version, by behaviour.
export function variableFactsAt(
  component: Component,
  version: string,
): ReadonlyMap<VariableBehaviour, VariableFact> {
  return new Map(
    factsAt(variableFacts, 'variable', component, version).map((each) => [each.behaviour, each]),
  );
}
