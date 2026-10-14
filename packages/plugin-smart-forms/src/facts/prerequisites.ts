import type { ExpressionSite, QuestionnaireDocument } from 'sdc-questionnaire-lint';
import {
  extensionOf,
  isObject,
  itemOf,
  type Json,
  type PlacedExtension,
  resolve,
} from '../document.js';
import {
  ANSWER_EXPRESSION,
  ANSWER_OPTIONS_TOGGLE_EXPRESSION,
  ENABLE_WHEN_EXPRESSION,
  FHIRPATH,
  INITIAL_EXPRESSION,
  ITEM_POPULATION_CONTEXT,
  TARGET_CONSTRAINT,
} from '../urls.js';
import {
  type Evidence,
  getExpressionsFromItem,
  populatePrerequisites,
  populateSource,
  rendererSource,
  reproduced,
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

// Whether no earlier extension of the same URL on the element has the language text/fhirpath: the
// renderer takes the first of its URL with that language (getExpressionsFromItem.ts:29-60,178-191).
function noEarlierFhirPath(document: QuestionnaireDocument, site: ExpressionSite): boolean {
  const holder = holderOf(document, site);
  return (
    holder !== undefined &&
    !holder.siblings
      .slice(0, holder.index)
      .some(
        (each) =>
          isObject(each) &&
          each.url === holder.extension.url &&
          isObject(each.valueExpression) &&
          each.valueExpression.language === FHIRPATH,
      )
  );
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

// An itemPopulationContext populate keeps: its Expression and the linkId of its group.
interface ReadContext {
  readonly expression: Json;
  readonly linkId: unknown;
}

// The itemPopulationContexts populate reads, by name: on every item with child items, the first of
// its URL when it has a name and text; a later one of the same name replaces an earlier one, which
// is then never evaluated (readPopulationExpressions.ts:47-63).
function readContexts(document: QuestionnaireDocument): Map<string, ReadContext> {
  const contexts = new Map<string, ReadContext>();
  const visit = (items: readonly unknown[]): void => {
    for (const item of items) {
      if (!isObject(item) || children(item).length === 0) continue;
      const context = firstOfUrl(item.extension, ITEM_POPULATION_CONTEXT)?.valueExpression;
      if (isObject(context) && nonEmptyString(context.expression) && nonEmptyString(context.name)) {
        contexts.set(context.name, { expression: context, linkId: item.linkId });
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
function childNamesContext(group: Json, contexts: Map<string, ReadContext>): boolean {
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
    const own = [...contexts].find(([, context]) => context.linkId === next?.linkId);
    if (own === undefined) return false;
    contexts = new Map([own]);
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

function onItemWithChildren(document: QuestionnaireDocument, site: ExpressionSite): boolean {
  return site.item !== undefined && children(itemOf(document, site.item)).length > 0;
}

function isFirstNamedContext(document: QuestionnaireDocument, site: ExpressionSite): boolean {
  const holder = holderOf(document, site);
  return (
    holder !== undefined &&
    isFirstOfItsUrl(holder) &&
    nonEmptyString(site.name) &&
    nonEmptyString(site.text)
  );
}

// Why populate does not read an itemPopulationContext.
export type UnreadReason = 'on-root' | 'no-child-items' | 'not-first' | 'no-name' | 'no-text';

// Whether populate reads an itemPopulationContext site, or why not, from the prerequisites
// readBy checks: the first of its URL on an item with child items, with a name and text.
export function contextReadReason(
  document: QuestionnaireDocument,
  site: ExpressionSite,
): true | UnreadReason {
  if (!onItemWithChildren(document, site)) {
    return site.item === undefined ? 'on-root' : 'no-child-items';
  }
  if (isFirstNamedContext(document, site)) return true;
  const holder = holderOf(document, site);
  if (holder === undefined || !isFirstOfItsUrl(holder)) return 'not-first';
  return nonEmptyString(site.name) ? 'no-text' : 'no-name';
}

// Whether populate reads an itemPopulationContext site: the first of its URL on an item with child
// items, with a name and text. A later one of the same name in the form replaces it and is evaluated
// instead, so its group is built from the later one's values (readPopulationExpressions.ts:47-63).
export function populationReadsContext(
  document: QuestionnaireDocument,
  site: ExpressionSite,
): boolean {
  return (
    site.location?.url === ITEM_POPULATION_CONTEXT && contextReadReason(document, site) === true
  );
}

const readPopulationExpressions = `${populateSource}readPopulationExpressions.ts`;
const constructResponse = `${populateSource}constructResponse.ts`;
// The key of a targetConstraint extension the renderer builds, or undefined when it builds none.
// It finds each sub-extension as constructTargetConstraint does, and keeps one only with a key.
function builtConstraintKey(extension: Json): string | undefined {
  const find = (url: string, valid: (each: Json) => boolean): Json | undefined =>
    subExtensions(extension, url).find(valid);
  const key = find('key', (each) => typeof each.valueId === 'string');
  const built =
    key !== undefined &&
    find('severity', (each) => each.valueCode === 'error' || each.valueCode === 'warning') &&
    find('expression', (each) => isObject(each.valueExpression)) &&
    find('human', (each) => nonEmptyString(each.valueString));
  return built && nonEmptyString(key.valueId) ? key.valueId : undefined;
}

// The targetConstraints the renderer keeps, by key: root extensions, then each item's extensions
// before its child items'; a later one with the same key replaces an earlier one, which is then
// never evaluated (extractTargetConstraint.ts:55-90).
function keptConstraints(document: QuestionnaireDocument): Map<string, Json> {
  const kept = new Map<string, Json>();
  const keep = (extensions: unknown): void => {
    for (const extension of Array.isArray(extensions) ? (extensions as unknown[]) : []) {
      if (!isObject(extension) || extension.url !== TARGET_CONSTRAINT) continue;
      const key = builtConstraintKey(extension);
      if (key !== undefined) kept.set(key, extension);
    }
  };
  const visit = (items: readonly unknown[]): void => {
    for (const item of items) {
      if (!isObject(item)) continue;
      keep(item.extension);
      visit(children(item));
    }
  };
  keep(document.resource.extension);
  visit(children(document.resource));
  return kept;
}

const extractTargetConstraint = `${rendererSource}utils/questionnaireStoreUtils/extractTargetConstraint.ts`;

const targetConstraint = { url: TARGET_CONSTRAINT };
const toggle = { url: ANSWER_OPTIONS_TOGGLE_EXPRESSION };

const firstFhirPath =
  'no earlier extension of the same URL on the element with the language text/fhirpath';

const renderer140: readonly Prerequisite[] = Object.freeze([
  prerequisite(
    { url: INITIAL_EXPRESSION },
    firstFhirPath,
    noEarlierFhirPath,
    source(getExpressionsFromItem, 29, 41),
  ),
  prerequisite(
    { url: ENABLE_WHEN_EXPRESSION },
    firstFhirPath,
    noEarlierFhirPath,
    source(getExpressionsFromItem, 48, 60),
  ),
  prerequisite(
    { url: ANSWER_EXPRESSION },
    firstFhirPath,
    noEarlierFhirPath,
    source(getExpressionsFromItem, 178, 191),
  ),
  prerequisite(
    targetConstraint,
    'a key (valueId), a severity (valueCode error or warning) and a human (valueString)',
    (document, site) => {
      const holder = holderOf(document, site);
      return holder !== undefined && builtConstraintKey(holder.extension) !== undefined;
    },
    source(extractTargetConstraint, 11, 53),
  ),
  prerequisite(
    targetConstraint,
    'no later targetConstraint in the form with the same key',
    (document, site) => {
      const holder = holderOf(document, site);
      const key = holder === undefined ? undefined : builtConstraintKey(holder.extension);
      return key !== undefined && keptConstraints(document).get(key) === holder?.extension;
    },
    source(extractTargetConstraint, 55, 90),
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
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 initialExpression prerequisites > evaluates only the first initialExpression on an item',
    ),
  ),
  prerequisite(
    { url: INITIAL_EXPRESSION },
    'an item outside a repeating itemPopulationContext group, or a direct child of a repeating group that populate reaches',
    populateEvaluatesInitialExpression,
    source(readPopulationExpressions, 76, 84),
    source(constructResponse, 225, 238),
    source(constructResponse, 574, 713),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 initialExpression prerequisites > evaluates an initialExpression in a repeating group without an itemPopulationContext, but prefills nothing',
    ),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 initialExpression prerequisites > prefills a child of a repeating group bound by its itemPopulationContext once per repetition',
    ),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 initialExpression prerequisites > does not evaluate an item in a nested repeating group without its own itemPopulationContext',
    ),
  ),
  prerequisite(
    { url: ITEM_POPULATION_CONTEXT },
    'an item with child items; a root itemPopulationContext is read by nothing',
    onItemWithChildren,
    source(readPopulationExpressions, 52, 56),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > does not evaluate one on a leaf item',
    ),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > does not evaluate one on the root',
    ),
  ),
  prerequisite(
    { url: ITEM_POPULATION_CONTEXT },
    'the first itemPopulationContext on the item, with a name and text',
    isFirstNamedContext,
    source(readPopulationExpressions, 53, 63),
    source(readPopulationExpressions, 128, 141),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > does not evaluate one without a name',
    ),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > does not evaluate one after another on the same item',
    ),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > does not evaluate one with no text',
    ),
  ),
  prerequisite(
    { url: ITEM_POPULATION_CONTEXT },
    'no later itemPopulationContext in the form with the same name',
    (document, site) =>
      site.name !== undefined &&
      readContexts(document).get(site.name)?.expression ===
        resolve(document, site.expressionPointer),
    source(readPopulationExpressions, 56, 63),
    reproduced(
      populatePrerequisites,
      'populate 4.7.1 itemPopulationContext prerequisites > never evaluates one that a later one with the same name replaces',
    ),
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
