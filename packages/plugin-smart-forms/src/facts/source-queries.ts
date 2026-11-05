/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import {
  type Evidence,
  inAppPopulateSource,
  populateSource,
  populateSourceQueries,
  type Reported,
  reported,
  reproduced,
  source,
} from './evidence.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// Which results of the root sourceQueries a component binds, and under which names. Only
// population reads sourceQueries; the renderer gets the results only through additionalContext,
// so its versions have no sourceQueries facts.
// - read-from-root: only root extensions with the exact sourceQueries URL are read, every one of
//   them; item-level ones and a URL with a |version are ignored.
// - requires-patient-subject: nothing is read when the root subjectType is non-empty and lacks
//   Patient: population stops before reading sourceQueries.
// - contained-named-by-id: a #id reference is named id (#%x as %x, #a b as a b). It is bound only
//   when the first contained resource with that id and resourceType Bundle has an id and an entry
//   element, entry: [] and any Bundle.type included, to that Bundle itself.
// - reference-named-by-index: any other non-empty reference is named sourceQuery<i>, where i counts
//   from 0 every sourceQueries extension with a valueReference, display-only, empty and # ones
//   included. It is fetched, and bound to the resource the fetch returns; a failed fetch or an
//   OperationOutcome leaves it unset.
// - entries-filled-only-from-data: the entries of a contained Bundle are filled only from a fetch
//   callback that resolves to { data: resource }; the app's callback resolves to the resource
//   itself, so in the app the Bundle is bound with its entries' resources empty.
// - contained-fetched-without-launch: when no launch resource is supplied, a #id reference is also
//   passed to the fetch callback, which in the app is a GET to the server base.
export type SourceQueryBehaviour =
  | 'read-from-root'
  | 'requires-patient-subject'
  | 'contained-named-by-id'
  | 'reference-named-by-index'
  | 'entries-filled-only-from-data'
  | 'contained-fetched-without-launch';

export interface SourceQueryFact extends Reported {
  readonly behaviour: SourceQueryBehaviour;
  readonly evidence: readonly Evidence[];
}

// The aehrc/smart-forms issues that report a behaviour.
const upstream: Readonly<Partial<Record<SourceQueryBehaviour, readonly number[]>>> = {
  'entries-filled-only-from-data': [2160],
  'contained-fetched-without-launch': [2165],
};

function fact(behaviour: SourceQueryBehaviour, ...evidence: Evidence[]): SourceQueryFact {
  return reported<SourceQueryFact>(
    Object.freeze({ behaviour, evidence: Object.freeze(evidence) }),
    upstream[behaviour],
  );
}

const inputParameters = `${inAppPopulateSource}inputParameters.ts`;
const context = `${populateSource}createFhirPathContext.ts`;
const suite = 'populate 4.7.1 sourceQueries > ';
const test = (name: string): Evidence => reproduced(populateSourceQueries, `${suite}${name}`);

const populate471: readonly SourceQueryFact[] = Object.freeze([
  fact(
    'read-from-root',
    source(inputParameters, 127, 141),
    test('reads only root sourceQueries extensions with the exact URL'),
  ),
  fact(
    'requires-patient-subject',
    source(inputParameters, 209, 212),
    source(inputParameters, 293, 303),
    test('reads no sourceQueries when subjectType lacks Patient'),
  ),
  fact(
    'contained-named-by-id',
    source(inputParameters, 395, 429),
    source(context, 559, 597),
    test('binds a #id to the contained Bundle with that id when it has entries'),
    test('binds a #id to a contained Bundle with an empty entry, of any type'),
    test('leaves a #id unset for a contained Bundle without entry'),
    test('leaves a #id unset without a contained Bundle with that id'),
    test('uses only the first contained Bundle with the id'),
    test('binds a #%x reference as %x and a #a b reference as a b'),
  ),
  fact(
    'reference-named-by-index',
    source(inputParameters, 262, 269),
    source(inputParameters, 395, 429),
    source(context, 291, 371),
    test('names a reference sourceQuery and the index of every extension with a valueReference'),
    test('binds a fetched reference to the resource it returns'),
    test('leaves a fetched reference unset after a failure or an OperationOutcome'),
  ),
  fact(
    'entries-filled-only-from-data',
    source(context, 430, 437),
    test('leaves contained Bundle entries unresolved with the app callback'),
  ),
  fact(
    'contained-fetched-without-launch',
    source(context, 523, 550),
    source(context, 716, 721),
    test('passes a #id to the fetch callback without a launch resource'),
  ),
]);

export const sourceQueryFacts: FactTable<readonly SourceQueryFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': Object.freeze([]) }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// The sourceQueries facts of a component version, by behaviour.
export function sourceQueriesAt(
  component: Component,
  version: string,
): ReadonlyMap<SourceQueryBehaviour, SourceQueryFact> {
  return new Map(
    factsAt(sourceQueryFacts, 'sourceQueries', component, version).map((each) => [
      each.behaviour,
      each,
    ]),
  );
}
