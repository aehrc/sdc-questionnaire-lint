import type { ExpressionSite, QuestionnaireDocument } from 'sdc-questionnaire-lint';
import { extensionOf, isObject, itemOf, type Json, type PlacedExtension } from '../document.js';
import {
  ANSWER_OPTIONS_TOGGLE_EXPRESSION,
  INITIAL_EXPRESSION,
  ITEM_POPULATION_CONTEXT,
  TARGET_CONSTRAINT,
} from '../urls.js';
import {
  type Evidence,
  getExpressionsFromItem,
  populateSource,
  rendererSource,
  source,
} from './evidence.js';
import type { Location } from './languages.js';
import { type Component, type FactTable, factsAt } from './versions.js';

// What a component needs, beyond the location, before it reads an Expression there. A
// prerequisite never depends on the language: how a component handles the language is a separate
// fact (languages.ts).
export interface Prerequisite {
  readonly location: Location;
  // What must hold, for maintainers.
  readonly requires: string;
  readonly holds: (document: QuestionnaireDocument, site: ExpressionSite) => boolean;
  readonly evidence: readonly Evidence[];
}

function prerequisite(
  location: Location,
  requires: string,
  holds: Prerequisite['holds'],
  ...evidence: Evidence[]
): Prerequisite {
  return Object.freeze({
    location: Object.freeze(location),
    requires,
    holds,
    evidence: Object.freeze(evidence),
  });
}

function children(item: Json | undefined): readonly unknown[] {
  return Array.isArray(item?.item) ? item.item : [];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

// The first extension of a URL in an extension array, as Array.find picks it.
function firstOfUrl(extensions: unknown, url: unknown): Json | undefined {
  return Array.isArray(extensions)
    ? (extensions as unknown[]).find((each): each is Json => isObject(each) && each.url === url)
    : undefined;
}

function isFirstOfItsUrl({ extension, siblings, index }: PlacedExtension): boolean {
  return firstOfUrl(siblings, extension.url) === siblings[index];
}

// Whether a site's sub-extension is the first `expression` sub-extension with a valueExpression,
// which is the one the renderer uses.
function isFirstExpression(document: QuestionnaireDocument, site: ExpressionSite): boolean {
  const placed = extensionOf(document, site);
  const extensions = placed?.holder.extension.extension;
  return (
    placed?.sub !== undefined &&
    Array.isArray(extensions) &&
    (extensions as unknown[]).find(
      (each) => isObject(each) && each.url === 'expression' && isObject(each.valueExpression),
    ) === placed.sub.extension
  );
}

function subExtensions(extension: Json, url: string): Json[] {
  return Array.isArray(extension.extension)
    ? (extension.extension as unknown[]).filter(
        (each): each is Json => isObject(each) && each.url === url,
      )
    : [];
}

// The items from a top-level item down to a site's item.
function itemsOnPath(document: QuestionnaireDocument, site: ExpressionSite): Json[] {
  const segments = (site.item?.pointer ?? '').slice(document.resourcePointer.length).split('/');
  const path: Json[] = [];
  let node: unknown = document.resource;
  for (let i = 1; i + 1 < segments.length; i += 2) {
    node =
      isObject(node) && Array.isArray(node.item) ? node.item[Number(segments[i + 1])] : undefined;
    if (!isObject(node)) return [];
    path.push(node);
  }
  return path;
}

// The itemPopulationContexts populate reads, by name to the linkId of their group: on every item
// with child items, the first of its URL when it has a name and text; a later one of the same name
// replaces an earlier one (readPopulationExpressions.ts:47-63).
function readContexts(document: QuestionnaireDocument): Map<string, unknown> {
  const contexts = new Map<string, unknown>();
  const visit = (items: readonly unknown[]): void => {
    for (const item of items) {
      if (!isObject(item) || children(item).length === 0) continue;
      const context = firstOfUrl(item.extension, ITEM_POPULATION_CONTEXT)?.valueExpression;
      if (isObject(context) && nonEmptyString(context.expression) && nonEmptyString(context.name)) {
        contexts.set(context.name, item.linkId);
      }
      visit(children(item));
    }
  };
  visit(children(document.resource));
  return contexts;
}

function initialExpressionText(item: unknown): string | undefined {
  const expression = isObject(item)
    ? firstOfUrl(item.extension, INITIAL_EXPRESSION)?.valueExpression
    : undefined;
  return isObject(expression) && nonEmptyString(expression.expression)
    ? expression.expression
    : undefined;
}

// Whether a direct child's initialExpression names one of the contexts: populate builds the
// repetitions of a repeating group from the first child whose context has a value, and evaluates
// no child otherwise. The name is the text between the first % and the first .
// (constructResponse.ts:574-594, readPopulationExpressions.ts:143-148).
function childNamesContext(group: Json, contexts: Map<string, unknown>): boolean {
  return children(group).some((child) => {
    const text = initialExpressionText(child);
    const name = text?.substring(text.indexOf('%') + 1, text.indexOf('.'));
    return name !== undefined && name !== '' && contexts.has(name);
  });
}

function isRepeatingGroup(item: Json): boolean {
  return item.type === 'group' && item.repeats === true && children(item).length > 0;
}

// Whether populate evaluates the initialExpression on a site's item.
// - Outside a repeating group with an itemPopulationContext, every item's is evaluated once.
// - Below one, only a direct child of a repeating group is evaluated, once per repetition, and only
//   when the group is reached. A repeating group's children are reached only through a child with
//   an itemPopulationContext of its own, with that context alone. So an item deeper than a direct
//   child is evaluated only when it is a direct child of such a nested repeating group
//   (readPopulationExpressions.ts:76-84, constructResponse.ts:225-238, 596-713).
function populateEvaluatesInitialExpression(
  document: QuestionnaireDocument,
  site: ExpressionSite,
): boolean {
  const path = itemsOnPath(document, site);
  const ancestors = path.slice(0, -1);
  const underContext = ancestors.some(
    (item) =>
      item.repeats === true &&
      isObject(firstOfUrl(item.extension, ITEM_POPULATION_CONTEXT)?.valueExpression),
  );
  if (!underContext) return true;
  let contexts = readContexts(document);
  for (const [index, item] of ancestors.entries()) {
    if (!isRepeatingGroup(item)) continue;
    if (!childNamesContext(item, contexts)) return false;
    const next = path[index + 1];
    if (index === ancestors.length - 1) return true;
    const name = [...contexts].find(([, linkId]) => linkId === next?.linkId)?.[0];
    if (name === undefined) return false;
    contexts = new Map([[name, next?.linkId]]);
  }
  // The item's parent is not a repeating group, and populate leaves items below a context out of
  // the expressions it evaluates once.
  return false;
}

function holderOf(
  document: QuestionnaireDocument,
  site: ExpressionSite,
): PlacedExtension | undefined {
  return extensionOf(document, site)?.holder;
}

const readPopulationExpressions = `${populateSource}readPopulationExpressions.ts`;
const constructResponse = `${populateSource}constructResponse.ts`;
const extractTargetConstraint = `${rendererSource}utils/questionnaireStoreUtils/extractTargetConstraint.ts`;

const targetConstraint = { url: TARGET_CONSTRAINT };
const toggle = { url: ANSWER_OPTIONS_TOGGLE_EXPRESSION };

const renderer140: readonly Prerequisite[] = Object.freeze([
  prerequisite(
    targetConstraint,
    'a key (valueId), a severity (valueCode error or warning) and a human (valueString)',
    (document, site) => {
      const holder = holderOf(document, site);
      if (holder === undefined) return false;
      const has = (url: string, valid: (each: Json) => boolean): boolean =>
        subExtensions(holder.extension, url).some(valid);
      return (
        has('key', (each) => nonEmptyString(each.valueId)) &&
        has('severity', (each) => each.valueCode === 'error' || each.valueCode === 'warning') &&
        has('human', (each) => nonEmptyString(each.valueString))
      );
    },
    source(extractTargetConstraint, 11, 53),
  ),
  prerequisite(
    targetConstraint,
    'the first expression sub-extension with a valueExpression',
    isFirstExpression,
    source(extractTargetConstraint, 24, 26),
  ),
  prerequisite(
    toggle,
    'an option sub-extension with valueCoding, valueString or valueInteger',
    (document, site) => {
      const holder = holderOf(document, site);
      return (
        holder !== undefined &&
        subExtensions(holder.extension, 'option').some(
          (each) =>
            each.valueCoding !== undefined ||
            each.valueString !== undefined ||
            each.valueInteger !== undefined,
        )
      );
    },
    source(getExpressionsFromItem, 211, 251),
  ),
  prerequisite(
    toggle,
    'the first expression sub-extension with a valueExpression',
    isFirstExpression,
    source(getExpressionsFromItem, 215, 217),
  ),
]);

const populate471: readonly Prerequisite[] = Object.freeze([
  prerequisite(
    { url: INITIAL_EXPRESSION },
    'the first initialExpression on the item',
    (document, site) => {
      const holder = holderOf(document, site);
      return holder !== undefined && isFirstOfItsUrl(holder);
    },
    source(readPopulationExpressions, 108, 121),
  ),
  prerequisite(
    { url: INITIAL_EXPRESSION },
    'an item outside a repeating itemPopulationContext group, or a direct child of a repeating group that populate reaches',
    populateEvaluatesInitialExpression,
    source(readPopulationExpressions, 76, 84),
    source(constructResponse, 225, 238),
    source(constructResponse, 574, 713),
  ),
  prerequisite(
    { url: ITEM_POPULATION_CONTEXT },
    'an item with child items; a root itemPopulationContext is read by nothing',
    (document, site) => site.item !== undefined && children(itemOf(document, site.item)).length > 0,
    source(readPopulationExpressions, 52, 56),
  ),
  prerequisite(
    { url: ITEM_POPULATION_CONTEXT },
    'the first itemPopulationContext on the item, with a name and text',
    (document, site) => {
      const holder = holderOf(document, site);
      return (
        holder !== undefined &&
        isFirstOfItsUrl(holder) &&
        nonEmptyString(site.name) &&
        nonEmptyString(site.text)
      );
    },
    source(readPopulationExpressions, 53, 63),
    source(readPopulationExpressions, 128, 141),
  ),
]);

export const prerequisites: FactTable<readonly Prerequisite[]> = Object.freeze({
  renderer: Object.freeze({ '1.4.0': renderer140 }),
  populate: Object.freeze({ '4.7.1': populate471 }),
});

// Whether every prerequisite of a component version at a site's location holds.
export function prerequisitesHold(
  component: Component,
  version: string,
  document: QuestionnaireDocument,
  site: ExpressionSite,
): boolean {
  return factsAt(prerequisites, 'prerequisite', component, version)
    .filter(({ location }) => location.url === site.location?.url)
    .every(({ holds }) => holds(document, site));
}
