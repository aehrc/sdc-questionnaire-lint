import type { Declaration, QuestionnaireDocument, RuleContext } from 'sdc-questionnaire-lint';
import { arrayOf, extensionOf, isObject, itemsOf, type Json } from './document.js';
import { requireCompat, storesVariable } from './eligibility.js';
import { populationReadsContext, prerequisitesHold } from './facts/prerequisites.js';
import { sourceQueriesAt } from './facts/source-queries.js';
import { variableFactsAt } from './facts/variables.js';
import { launchContextsOf } from './launch-contexts.js';
import { readSourceQueries, type SourceQuery } from './source-queries.js';
import { FHIRPATH, SOURCE_QUERIES, VARIABLE, X_FHIR_QUERY } from './urls.js';

// What Smart Forms population binds for one document and the selected populate version, under the
// supported integration (docs/smart-forms-rules.md, S1 and Shared plugin infrastructure,
// Population). Built once, then asked.

// When population binds a name (population-evaluation-order): its step, then its item's place in
// population's key order, then its place in its extension array. Step 1 binds the launch
// resources, the sourceQueries results and the application/x-fhir-query variables; step 2 the root
// text/fhirpath variables; step 3 the item ones; step 4 the itemPopulationContexts.
export type Position = readonly [step: 1 | 2 | 3 | 4, key: number, index: number];

export const compare = (a: Position, b: Position): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// What population binds for a declaration: the name it stores the value under, and when. at is
// 'never' when population keeps the name but never evaluates the declaration, such as an
// itemPopulationContext a later one of its name replaces, and 'unknown' when an item's linkId makes
// the order unreadable.
export interface Binding {
  readonly name: string;
  readonly at: Position | 'never' | 'unknown';
}

// Something population binds a name with: a declaration, with when it binds it, or a sourceQueries
// result, with its extension's pointer.
export type Binder =
  | { readonly kind: 'declaration'; readonly declaration: Declaration; readonly at: Binding['at'] }
  | { readonly kind: 'sourceQuery'; readonly query: SourceQuery; readonly pointer: string };

export interface Population {
  // Whether population runs for the form (population-needs-input).
  readonly runs: boolean;
  // The root sourceQueries whose results population binds, under the supported integration and
  // assuming external fetches succeed (P4): a #id whose first contained Bundle with that id has an
  // id and an entry element, and every other non-empty reference as sourceQuery<i>. One whose
  // name starts with % is left out: population binds #%x as %x, but a reference is written
  // without %.
  readonly sourceQueries: readonly SourceQuery[];
  // What population binds for a declaration, or undefined when it stores no name for it.
  bindingOf(declaration: Declaration): Binding | undefined;
  // Everything population binds a name with: the sourceQueries results in extension order, then
  // the declarations the model was given, earliest first, those population never evaluates or
  // whose order is unknown last, in document order.
  bindersOf(name: string): readonly Binder[];
}

// An application/x-fhir-query variable population fetches: with a name and expression text.
const isQueryInput = (extension: unknown): boolean => {
  if (!isObject(extension) || extension.url !== VARIABLE) return false;
  const { valueExpression: expression } = extension;
  return (
    isObject(expression) &&
    expression.language === X_FHIR_QUERY &&
    Boolean(expression.name) &&
    Boolean(expression.expression)
  );
};

// Whether population runs for the form (population-needs-input): it has a root launchContext, a
// root sourceQueries with a valueReference, or a query variable it fetches, and a subjectType that
// allows Patient.
function populationRuns(document: QuestionnaireDocument, items: readonly Json[]): boolean {
  const { subjectType, extension } = document.resource;
  const subjects = arrayOf(subjectType);
  if (subjects.length > 0 && !subjects.includes('Patient')) return false;
  const root = arrayOf(extension);
  return (
    launchContextsOf(document).some(({ input }) => input) ||
    root.some(
      (each) => isObject(each) && each.url === SOURCE_QUERIES && Boolean(each.valueReference),
    ) ||
    [root, ...items.map((item) => arrayOf(item.extension))].some((each) => each.some(isQueryInput))
  );
}

// Each linkId's place in the order population evaluates item variables in: a plain object filled
// in post-order, an item after its child items, for every item with an extension property, and
// read with Object.keys, so integer-like linkIds come first (createFhirPathContext.ts:194-214).
function keyOrder(document: QuestionnaireDocument): ReadonlyMap<string, number> {
  const keys: Record<string, true> = {};
  const visit = (items: unknown): void => {
    for (const item of arrayOf(items)) {
      if (!isObject(item)) continue;
      visit(item.item);
      if (item.extension) keys[String(item.linkId)] = true;
    }
  };
  visit(document.resource.item);
  return new Map(Object.keys(keys).map((key, index) => [key, index]));
}

// How many items have each linkId, by String(linkId), the key population gives an item.
function linkIdCounts(items: readonly Json[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { linkId } of items) {
    counts.set(String(linkId), (counts.get(String(linkId)) ?? 0) + 1);
  }
  return counts;
}

// The root sourceQueries population binds (Population.sourceQueries).
function suppliedSourceQueries(
  document: QuestionnaireDocument,
  version: string,
): readonly SourceQuery[] {
  const facts = sourceQueriesAt('populate', version);
  if (!facts.has('read-from-root')) return [];
  const { subjectType } = document.resource;
  if (
    facts.has('requires-patient-subject') &&
    Array.isArray(subjectType) &&
    subjectType.length > 0 &&
    !subjectType.includes('Patient')
  ) {
    return [];
  }
  return readSourceQueries(document).filter(({ reference, name, bundle }) => {
    if (name === undefined || name.startsWith('%') || reference === undefined) return false;
    if (reference.startsWith('#')) {
      return facts.has('contained-named-by-id') && bundle?.bound === true;
    }
    return facts.has('reference-named-by-index');
  });
}

// Orders bindings earliest first, 'never' and 'unknown' after every position.
const byPosition = (a: Binding['at'], b: Binding['at']): number =>
  typeof a === 'string'
    ? Number(typeof b !== 'string')
    : typeof b === 'string'
      ? -1
      : compare(a, b);

// The model for a rule's ctx or the hostVariables hook's input, which has no declarations, so
// bindersOf then finds only sourceQueries results. Built lazily: storedName builds one for each
// declaration it is asked about.
export function population(
  ctx: Pick<RuleContext, 'document' | 'compat'> & {
    readonly declarations?: readonly Declaration[];
  },
): Population {
  const { document, declarations = [] } = ctx;
  const versions = requireCompat(ctx);
  const facts = variableFactsAt('populate', versions.populate);
  let items: readonly Json[] | undefined;
  let counts: ReadonlyMap<string, number> | undefined;
  let keys: ReadonlyMap<string, number> | undefined;

  // A linkId population's order can be read from: present, and the key of no other item.
  const reliable = (linkId: string | undefined): linkId is string =>
    linkId !== undefined &&
    (counts ??= linkIdCounts((items ??= itemsOf(document.resource)))).get(linkId) === 1;

  // Whether a declaration is in the extension array of the root or an item of this
  // Questionnaire, where population reads variables: not in a modifierExtension, and not in a
  // contained resource, which population does not evaluate.
  const inForm = ({ item, pointer }: Declaration): boolean => {
    const { resourcePointer } = document;
    return (
      pointer.startsWith(`${item?.pointer ?? resourcePointer}/extension/`) &&
      (item === undefined ||
        (item.pointer.startsWith(resourcePointer) &&
          /^(\/item\/\d+)+$/.test(item.pointer.slice(resourcePointer.length))))
    );
  };

  // The name population stores a declaration's value under (P5 Stored names): a variable in a
  // language it runs, except an item FHIRPath variable when the root has no extensions; an
  // itemPopulationContext it reads, one a later one of its name replaces included; and a root
  // launchContext under the name it binds the launch resource under, read from the root extension
  // array, so not one core declares in the root modifierExtension. No other named expression
  // stores a name.
  const storedName = (declaration: Declaration): string | undefined => {
    const { kind, site, item, name } = declaration;
    if (kind === 'launchContext') {
      return facts.has('launch-context-named-by-position')
        ? launchContextsOf(document).find(({ pointer }) => pointer === declaration.pointer)
            ?.boundName
        : undefined;
    }
    if (site === undefined) return undefined;
    if (kind === 'variable') {
      const skipped =
        facts.has('item-fhirpath-variable-needs-root-extensions') &&
        item !== undefined &&
        site.language === FHIRPATH &&
        arrayOf(document.resource.extension).length === 0;
      return !skipped && storesVariable(ctx, site, 'populate') ? name : undefined;
    }
    if (kind === 'itemPopulationContext') {
      return facts.has('population-context-stored-by-name') &&
        populationReadsContext(document, site)
        ? name
        : undefined;
    }
    return undefined;
  };

  // When population evaluates a declaration it stores a name for.
  const evaluatedAt = (declaration: Declaration): Binding['at'] => {
    const { kind, site, item } = declaration;
    if (!facts.has('population-evaluation-order')) return 'unknown';
    if (!inForm(declaration)) return 'never';
    if (kind === 'launchContext') return [1, 0, 0];
    if (site === undefined) return 'never';
    // A query variable is fetched first, but only with expression text.
    if (site.language === X_FHIR_QUERY) return site.text ? [1, 0, 0] : 'never';
    // A linkId __proto__ sets the prototype of population's object instead of adding a key, so
    // population never evaluates the item's variables.
    if (kind === 'variable' && item?.linkId === '__proto__') return 'never';
    const key =
      item === undefined
        ? 0
        : reliable(item.linkId)
          ? (keys ??= keyOrder(document)).get(item.linkId)
          : undefined;
    if (key === undefined) return 'unknown';
    if (kind === 'itemPopulationContext') {
      return prerequisitesHold('populate', versions.populate, document, site) ? [4, 0, 0] : 'never';
    }
    const index = extensionOf(document, site)?.holder.index;
    if (index === undefined) return 'never';
    return item === undefined ? [2, 0, index] : [3, key, index];
  };

  let runs: boolean | undefined;
  let sourceQueries: readonly SourceQuery[] | undefined;
  const bindings = new Map<Declaration, Binding | undefined>();
  let binders: ReadonlyMap<string, readonly Binder[]> | undefined;
  const model: Population = {
    get runs() {
      return (runs ??=
        !facts.has('population-needs-input') ||
        populationRuns(document, (items ??= itemsOf(document.resource))));
    },
    get sourceQueries() {
      return (sourceQueries ??= suppliedSourceQueries(document, versions.populate));
    },
    bindingOf(declaration) {
      if (bindings.has(declaration)) return bindings.get(declaration);
      const name = storedName(declaration);
      const binding = name === undefined ? undefined : { name, at: evaluatedAt(declaration) };
      bindings.set(declaration, binding);
      return binding;
    },
    bindersOf(name) {
      binders ??= bindersByName();
      return binders.get(name) ?? [];
    },
  };

  const bindersByName = (): ReadonlyMap<string, readonly Binder[]> => {
    const byName = new Map<string, Binder[]>();
    const add = (each: string, binder: Binder): void => {
      const list = byName.get(each);
      if (list === undefined) byName.set(each, [binder]);
      else list.push(binder);
    };
    for (const query of model.sourceQueries) {
      if (query.name === undefined) continue;
      const pointer = `${document.resourcePointer}/extension/${String(query.extensionIndex)}`;
      add(query.name, { kind: 'sourceQuery', query, pointer });
    }
    const bound = declarations.flatMap((declaration) => {
      const binding = model.bindingOf(declaration);
      return binding === undefined ? [] : [{ declaration, ...binding }];
    });
    bound.sort((a, b) => byPosition(a.at, b.at));
    for (const { declaration, name, at } of bound)
      add(name, { kind: 'declaration', declaration, at });
    return byName;
  };

  return model;
}
