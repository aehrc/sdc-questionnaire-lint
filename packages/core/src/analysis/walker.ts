import { isObject } from '../config/validate.js';
import { isWithin, parsePointer, toPointer } from '../json-pointer.js';
import type {
  ExpressionSite,
  ExpressionUseCase,
  QuestionnaireDocument,
  SiteItem,
} from '../plugins/types.js';
import { type Owner, registry, type RegistryEntry } from './registry.js';

type Json = Record<string, unknown>;
type Segments = readonly (string | number)[];

// What identifies a place in a Questionnaire independently of array positions where possible.
// Fingerprints and suppression selectors use it.
export interface SiteIdentity {
  // linkId of the innermost item on the path that has one.
  linkId?: string;
  // URLs of the extensions on the path below that item, outermost first.
  extensionUrls: readonly string[];
  // valueExpression.name of the innermost extension, for variables and other declarations.
  declarationName?: string;
  // The rest of the pointer below the last item or extension; the whole resource-relative pointer
  // when the path crosses neither.
  tail: string;
}

export interface LocatedPointer {
  identity: SiteIdentity;
  // The JSON value at the pointer, or undefined when the pointer does not resolve.
  value: unknown;
}

// A Questionnaire with what the walker found in it.
export interface WalkedDocument {
  document: QuestionnaireDocument;
  sites: readonly ExpressionSite[];
  // A JSON Pointer from the root of the input file, identified by the same rules the walk uses;
  // undefined when it is not a pointer or lies outside the Questionnaire.
  locate(pointer: string): LocatedPointer | undefined;
}

// The registered location an Expression object was found at.
interface Claim {
  entry: RegistryEntry;
  element?: string;
}

// The identity parts gathered on the way down to a node.
interface Trail {
  linkId?: string;
  extensionUrls: readonly string[];
  declarationName?: string;
  // Segments up to and including the last item with a linkId or extension on the path.
  anchor: number;
}

// One node on the way down from the resource root.
interface Frame {
  node: unknown;
  // Relative to the resource.
  segments: Segments;
  // Set for the Questionnaire root and its items, the elements registered locations sit on.
  owner?: Owner;
  // The node is an owner's item array, so its children are items.
  items: boolean;
  // The node is an extension or modifierExtension array.
  extensions: boolean;
  // The innermost enclosing item.
  item?: SiteItem;
  trail: Trail;
}

const noUseCases: readonly ExpressionUseCase[] = Object.freeze([]);

function stringField(object: Json, key: string): Record<string, string> {
  const value = object[key];
  return typeof value === 'string' ? { [key]: value } : {};
}

function step(node: unknown, segment: string | number): unknown {
  if (Array.isArray(node)) {
    return /^(0|[1-9]\d*)$/.test(String(segment)) ? node[Number(segment)] : undefined;
  }
  return isObject(node) ? node[segment] : undefined;
}

// The structural rules of a Questionnaire: what is an item, an extension and a contained resource.
// The walk and locate both descend through here, so sites and identities agree.
function descend(
  parent: Frame,
  segment: string | number,
  pointerOf: (s: Segments) => string,
): Frame {
  const node = step(parent.node, segment);
  const segments = [...parent.segments, segment];
  let { item, trail } = parent;
  let owner: Owner | undefined;
  if (parent.items) {
    owner = 'item';
    item = Object.freeze({
      pointer: pointerOf(segments),
      ...(isObject(node) ? stringField(node, 'linkId') : {}),
    });
    if (item.linkId !== undefined) {
      trail = { linkId: item.linkId, extensionUrls: [], anchor: segments.length };
    }
  } else if (parent.extensions && isObject(node) && typeof node.url === 'string') {
    const expression = node.valueExpression;
    trail = {
      ...(trail.linkId === undefined ? {} : { linkId: trail.linkId }),
      extensionUrls: [...trail.extensionUrls, node.url],
      ...(isObject(expression) && typeof expression.name === 'string'
        ? { declarationName: expression.name }
        : {}),
      anchor: segments.length,
    };
  } else if (parent.owner === 'root' && segment === 'contained') {
    // Contained resources are outside any item.
    item = undefined;
  }
  return {
    node,
    segments,
    ...(owner === undefined ? {} : { owner }),
    items: parent.owner !== undefined && segment === 'item' && Array.isArray(node),
    extensions: (segment === 'extension' || segment === 'modifierExtension') && Array.isArray(node),
    ...(item === undefined ? {} : { item }),
    trail,
  };
}

function identityOf({ segments, trail }: Frame): SiteIdentity {
  return {
    ...(trail.linkId === undefined ? {} : { linkId: trail.linkId }),
    extensionUrls: trail.extensionUrls,
    ...(trail.declarationName === undefined ? {} : { declarationName: trail.declarationName }),
    tail: toPointer(segments.slice(trail.anchor)),
  };
}

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

// Every expression site in a Questionnaire, in document order: a depth-first, pre-order traversal
// of its JSON. Sites at registered locations on the root and items are registered; any other
// object with a string language and expression, including in contained resources, is not.
export function walkDocument(document: QuestionnaireDocument): WalkedDocument {
  const sites: ExpressionSite[] = [];
  const claims = new Map<Json, Claim>();
  // Extensions that matched a registered location. Only their claimed Expressions are sites: an
  // unexpected shape yields none rather than an unregistered site.
  const registered = new Set<Json>();
  const pointerOf = (segments: Segments): string => document.resourcePointer + toPointer(segments);
  const root: Frame = {
    node: document.resource,
    segments: [],
    owner: 'root',
    items: false,
    extensions: false,
    trail: { extensionUrls: [], anchor: 0 },
  };

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

  function addSite(expression: Json, { segments, item }: Frame): void {
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

  // Below a registered extension, which holds no item or contained resource, only its claimed
  // Expressions are sites.
  function visit(frame: Frame, belowRegistered: boolean): void {
    const { node } = frame;
    if (Array.isArray(node)) {
      node.forEach((_, index) => {
        visit(descend(frame, index, pointerOf), belowRegistered);
      });
      return;
    }
    if (!isObject(node)) return;
    const inRegistered = belowRegistered || registered.has(node);
    if (!inRegistered && frame.owner !== undefined) claimElement(node, frame.owner);
    if (
      claims.has(node) ||
      (!inRegistered && typeof node.language === 'string' && typeof node.expression === 'string')
    ) {
      addSite(node, frame);
    }
    for (const key of Object.keys(node)) visit(descend(frame, key, pointerOf), inRegistered);
  }

  visit(root, false);
  const resourceDepth = parsePointer(document.resourcePointer)?.length ?? 0;
  return Object.freeze({
    document,
    sites: Object.freeze(sites),
    locate(pointer: string): LocatedPointer | undefined {
      const segments = parsePointer(pointer);
      if (segments === undefined || !isWithin(pointer, document.resourcePointer)) return undefined;
      let frame = root;
      for (const segment of segments.slice(resourceDepth)) {
        frame = descend(frame, segment, pointerOf);
      }
      return { identity: identityOf(frame), value: frame.node };
    },
  });
}
