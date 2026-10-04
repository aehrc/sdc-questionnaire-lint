import { isObject } from '../config/validate.js';
import { toPointer } from '../json-pointer.js';
import type {
  ExpressionSite,
  ExpressionUseCase,
  QuestionnaireDocument,
  SiteItem,
} from '../plugins/types.js';
import { type Owner, registry, type RegistryEntry } from './registry.js';

type Json = Record<string, unknown>;
type Segments = readonly (string | number)[];

// The registered location an Expression object was found at.
interface Claim {
  entry: RegistryEntry;
  element?: string;
}

const noUseCases: readonly ExpressionUseCase[] = Object.freeze([]);

// The Expression objects an extension holds for a registry entry; none when its shape is not the
// expected one, which is the FHIR Validator's to report.
function expressionsOf(extension: Json, entry: RegistryEntry): Json[] {
  if (entry.subExtension === undefined) {
    return isObject(extension.valueExpression) ? [extension.valueExpression] : [];
  }
  if (!Array.isArray(extension.extension)) return [];
  return extension.extension.flatMap((sub: unknown) =>
    isObject(sub) && sub.url === entry.subExtension && isObject(sub.valueExpression)
      ? [sub.valueExpression]
      : [],
  );
}

function stringField(object: Json, key: string): Record<string, string> {
  const value = object[key];
  return typeof value === 'string' ? { [key]: value } : {};
}

// Every expression site in a Questionnaire, in document order: a depth-first, pre-order traversal
// of its JSON. Sites at registered locations on the root and items are registered; any other
// object with a string language and expression, including in contained resources, is not.
export function walkDocument(document: QuestionnaireDocument): readonly ExpressionSite[] {
  const sites: ExpressionSite[] = [];
  const claims = new Map<Json, Claim>();
  // Extensions that matched a registered location. Only their claimed Expressions are sites: an
  // unexpected shape yields none rather than an unregistered site.
  const registered = new Set<Json>();
  const pointerOf = (segments: Segments): string => document.resourcePointer + toPointer(segments);

  function claimAll(
    extensions: unknown,
    matches: (entry: RegistryEntry) => boolean,
    element?: string,
  ): void {
    if (!Array.isArray(extensions)) return;
    for (const extension of extensions) {
      if (!isObject(extension)) continue;
      for (const entry of registry) {
        if (entry.url !== extension.url || !matches(entry)) continue;
        registered.add(extension);
        for (const expression of expressionsOf(extension, entry)) {
          claims.set(expression, { entry, ...(element === undefined ? {} : { element }) });
        }
      }
    }
  }

  // Claims the Expressions in an element's extensions and its primitives' _element companions.
  function claimElement(element: Json, owner: Owner): void {
    for (const key of ['extension', 'modifierExtension']) {
      claimAll(element[key], (entry) => entry.on[owner] === true);
    }
    for (const [key, value] of Object.entries(element)) {
      if (!key.startsWith('_') || !isObject(value)) continue;
      const name = key.slice(1);
      claimAll(
        value.extension,
        (entry) => {
          const elements = entry.on[owner];
          return Array.isArray(elements) && elements.includes(name);
        },
        name,
      );
    }
  }

  function addSite(expression: Json, segments: Segments, item: SiteItem | undefined): void {
    const claim = claims.get(expression);
    const expressionPointer = pointerOf(segments);
    const text = stringField(expression, 'expression');
    const site: ExpressionSite = {
      pointer:
        text.expression === undefined ? expressionPointer : `${expressionPointer}/expression`,
      expressionPointer,
      carrier: claim?.entry.carrier ?? 'expression',
      ...(claim === undefined
        ? {}
        : {
            location: Object.freeze({
              url: claim.entry.url,
              ...(claim.entry.subExtension === undefined
                ? {}
                : { subExtension: claim.entry.subExtension }),
            }),
          }),
      registered: claim !== undefined,
      ...(claim?.element === undefined ? {} : { element: claim.element }),
      ...(item === undefined ? {} : { item }),
      ...stringField(expression, 'language'),
      ...(text.expression === undefined ? {} : { text: text.expression }),
      ...stringField(expression, 'reference'),
      ...stringField(expression, 'name'),
      declares: claim?.entry.declares ?? false,
      useCases: claim?.entry.useCases ?? noUseCases,
    };
    sites.push(Object.freeze(site));
  }

  // Below a registered extension, which holds no item or contained resource.
  function visitRegistered(node: unknown, segments: Segments, item: SiteItem | undefined): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => {
        visitRegistered(child, [...segments, index], item);
      });
      return;
    }
    if (!isObject(node)) return;
    if (claims.has(node)) addSite(node, segments, item);
    for (const [key, value] of Object.entries(node))
      visitRegistered(value, [...segments, key], item);
  }

  // owner is set for the Questionnaire root and its items, the elements registered locations sit
  // on; item is the innermost enclosing item.
  function visit(
    node: unknown,
    segments: Segments,
    owner: Owner | undefined,
    item: SiteItem | undefined,
  ): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => {
        visit(child, [...segments, index], undefined, item);
      });
      return;
    }
    if (!isObject(node)) return;
    if (registered.has(node)) {
      visitRegistered(node, segments, item);
      return;
    }
    if (owner !== undefined) claimElement(node, owner);
    if (
      claims.has(node) ||
      (typeof node.language === 'string' && typeof node.expression === 'string')
    ) {
      addSite(node, segments, item);
    }
    for (const [key, value] of Object.entries(node)) {
      const path = [...segments, key];
      if (owner !== undefined && key === 'item' && Array.isArray(value)) {
        value.forEach((child, index) => {
          const childPath = [...path, index];
          const childItem: SiteItem = Object.freeze({
            pointer: pointerOf(childPath),
            ...(isObject(child) ? stringField(child, 'linkId') : {}),
          });
          visit(child, childPath, 'item', childItem);
        });
      } else if (owner === 'root' && key === 'contained') {
        // Contained resources are walked for generic detection only, outside any item.
        visit(value, path, undefined, undefined);
      } else {
        visit(value, path, undefined, item);
      }
    }
  }

  visit(document.resource, [], 'root', undefined);
  return Object.freeze(sites);
}
