import {
  type Evidence,
  inAppPopulateSource,
  populateEmbeddings,
  populateSource,
  reproduced,
  source,
} from './evidence.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// How a component replaces the {{%…}} embeddings in the x-fhir-query variables it fetches. Only
// population replaces them; the renderer never does, so its versions have no embedding facts.
// - recognised-by-pattern: an embedding is {{% followed by at least one character other than a
//   line break, up to the first }} (the non-greedy /{{%(.*?)}}/g).
// - replaced-only-with-launch-resource: no embedding is replaced unless a launch resource is
//   supplied; with no launchContext declared, every query is sent with its braces.
// - replaced-by-unescaped-pattern: each embedding is replaced through new RegExp('{{%' + text +
//   '}}', 'g'), unescaped and applied to every query, so an invalid pattern fails population of
//   the whole form, and a pattern that does not match only its own embedding leaves the braces or
//   corrupts a query.
// - head-is-launch-context: the text before the first . names a launch resource; anything else
//   gives "undefined", and an embedding with no . or nothing before it gives an empty value.
// - evaluated-with-only: the text after the head is evaluated against the launch resource with
//   only these names; a reference to any other name fails, and the embedding becomes empty.
export type EmbeddingBehaviour =
  | 'recognised-by-pattern'
  | 'replaced-only-with-launch-resource'
  | 'replaced-by-unescaped-pattern'
  | 'head-is-launch-context'
  | 'evaluated-with-only';

export interface EmbeddingFact {
  readonly behaviour: EmbeddingBehaviour;
  // Set only for evaluated-with-only: the names the remainder can reference.
  readonly names?: readonly string[];
  readonly evidence: readonly Evidence[];
}

function fact(
  behaviour: EmbeddingBehaviour,
  names: readonly string[] | undefined,
  ...evidence: Evidence[]
): EmbeddingFact {
  return Object.freeze({
    behaviour,
    ...(names === undefined ? {} : { names: Object.freeze([...names]) }),
    evidence: Object.freeze(evidence),
  });
}

const embeddings = `${populateSource}createFhirPathContext.ts`;
const suite = 'populate 4.7.1 replaces {{%…}} embeddings > ';
const test = (name: string): Evidence => reproduced(populateEmbeddings, `${suite}${name}`);

const populate471: readonly EmbeddingFact[] = Object.freeze([
  fact(
    'recognised-by-pattern',
    undefined,
    source(embeddings, 745, 755),
    test('replaces an embedding in a root and an item query variable'),
    test('sends an embedding that does not start with {{% with its braces'),
  ),
  fact(
    'replaced-only-with-launch-resource',
    undefined,
    source(embeddings, 495, 551),
    test('sends every embedding with its braces when no launch context is declared'),
  ),
  fact(
    'replaced-by-unescaped-pattern',
    undefined,
    source(embeddings, 692, 743),
    source(`${inAppPopulateSource}populateQuestionnaire.ts`, 225, 236),
    test('fails population of the whole form on an invalid regular expression'),
    test('sends an embedding whose pattern does not match itself with its braces'),
    test('corrupts the queries an embedding pattern matches other text in'),
    test('replaces an embedding with operators and literals'),
  ),
  fact(
    'head-is-launch-context',
    undefined,
    source(embeddings, 649, 684),
    test('sends "undefined" for a head that is not a launch context'),
    test('sends an empty value for an embedding with no path after the head'),
  ),
  fact(
    'evaluated-with-only',
    ['context', 'ucum', 'factory', 'terminologyUrl', 'async', 'fhirServerUrl'],
    source(embeddings, 649, 684),
    test('evaluates the path with only %context, %ucum, %terminologyUrl and %fhirServerUrl'),
    test('empties an embedding that references another name'),
  ),
]);

export const embeddingFacts: FactTable<readonly EmbeddingFact[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': Object.freeze([]) }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// The embedding facts of a component version, by behaviour.
export function embeddingsAt(
  component: Component,
  version: string,
): ReadonlyMap<EmbeddingBehaviour, EmbeddingFact> {
  return new Map(
    factsAt(embeddingFacts, 'embedding', component, version).map((each) => [each.behaviour, each]),
  );
}
