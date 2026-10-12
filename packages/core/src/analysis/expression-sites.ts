import { toPointer } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { ExpressionSite, QuestionnaireDocument, SiteItem } from './expression-site.js';
import { type CatalogEntry, extensionCatalog, type Owner } from './extension-catalog.js';
import { FHIRPATH } from './fhirpath.js';
import { isQueryLanguage, scanQueryFragments } from './x-fhir-query.js';

type Json = Record<string, unknown>;
type Segments = readonly (string | number)[];

// The catalogued location an Expression object was claimed for.
interface Claim {
  entry: CatalogEntry;
  // For an extension in a primitive element's _element companion, the element name.
  element?: string;
}

function stringField(object: Json, key: string): Record<string, string> {
  const value = object[key];
  return typeof value === 'string' ? { [key]: value } : {};
}

// The Expression objects a catalogued extension holds; none when its shape is not the expected
// one, which is the FHIR Validator's to report.
function expressionsOf(extension: Json, entry: CatalogEntry): Json[] {
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

// One site per closed {{…}} fragment of a query site with text: FHIRPath at the query's place.
function fragmentSites(site: ExpressionSite): ExpressionSite[] {
  const query = site.text;
  if (!isQueryLanguage(site.language) || query === undefined) return [];
  return scanQueryFragments(query).fragments.map(({ startOffset, endOffset }) =>
    Object.freeze({
      pointer: site.pointer,
      expressionPointer: site.expressionPointer,
      carrier: 'fragment',
      ...(site.location === undefined ? {} : { location: site.location }),
      catalogued: site.catalogued,
      ...(site.element === undefined ? {} : { element: site.element }),
      ...(site.item === undefined ? {} : { item: site.item }),
      language: FHIRPATH,
      text: query.slice(startOffset, endOffset),
      declares: false,
      useCases: site.useCases,
      fragment: Object.freeze({ query, startOffset, endOffset }),
    }),
  );
}

// Every expression site in a Questionnaire, in document order: a depth-first, pre-order traversal
// of its JSON. Expressions held by catalogued extensions on the root and its items are catalogued
// sites; any other object with a string language and expression or reference, including in a
// contained resource, is an uncatalogued site. Each fragment of a query directly follows the query.
// The array is frozen, like each site: rules receive it as ctx.sites.
export function findExpressionSites(document: QuestionnaireDocument): readonly ExpressionSite[] {
  const sites: ExpressionSite[] = [];
  const claims = new Map<Json, Claim>();
  const pointerOf = (segments: Segments): string => document.resourcePointer + toPointer(segments);

  function claimAll(
    extensions: unknown,
    matches: (on: CatalogEntry['on'][Owner]) => boolean,
    owner: Owner,
    element?: string,
  ): void {
    if (!Array.isArray(extensions)) return;
    for (const extension of extensions) {
      if (!isObject(extension)) continue;
      for (const entry of extensionCatalog) {
        if (entry.url !== extension.url || !matches(entry.on[owner])) continue;
        for (const expression of expressionsOf(extension, entry)) {
          claims.set(expression, { entry, ...(element === undefined ? {} : { element }) });
        }
      }
    }
  }

  // Claims the Expressions in an owner's extensions and in its primitives' _element companions.
  function claimOwned(owner: Json, kind: Owner): void {
    claimAll(owner.extension, (on) => on === true, kind);
    claimAll(owner.modifierExtension, (on) => on === true, kind);
    for (const [key, value] of Object.entries(owner)) {
      if (!key.startsWith('_') || !isObject(value)) continue;
      const element = key.slice(1);
      claimAll(value.extension, (on) => Array.isArray(on) && on.includes(element), kind, element);
    }
  }

  function addSite(expression: Json, segments: Segments, item: SiteItem | undefined): void {
    const claim = claims.get(expression);
    const expressionPointer = pointerOf(segments);
    const text = expression.expression;
    const site: ExpressionSite = {
      pointer: typeof text === 'string' ? `${expressionPointer}/expression` : expressionPointer,
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
      catalogued: claim !== undefined,
      ...(claim?.element === undefined ? {} : { element: claim.element }),
      ...(item === undefined ? {} : { item }),
      ...stringField(expression, 'language'),
      ...(typeof text === 'string' ? { text } : {}),
      ...stringField(expression, 'reference'),
      ...stringField(expression, 'name'),
      // Any named Expression at a catalogued location declares its name (core-rules.md D9).
      declares: claim?.entry.carrier === 'expression' && typeof expression.name === 'string',
      useCases: claim?.entry.useCases ?? Object.freeze([]),
    };
    sites.push(Object.freeze(site), ...fragmentSites(site));
  }

  // owner is set for the root and its items; below anything else, such as contained, it is unset.
  function visit(node: unknown, segments: Segments, item?: SiteItem, owner?: Owner): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => {
        visit(child, [...segments, index], item);
      });
      return;
    }
    if (!isObject(node)) return;
    if (owner !== undefined) claimOwned(node, owner);
    if (
      claims.has(node) ||
      (typeof node.language === 'string' &&
        (typeof node.expression === 'string' || typeof node.reference === 'string'))
    ) {
      addSite(node, segments, item);
    }
    for (const [key, value] of Object.entries(node)) {
      const path = [...segments, key];
      if (owner === undefined || key !== 'item' || !Array.isArray(value)) {
        visit(value, path, item);
        continue;
      }
      value.forEach((child, index) => {
        const itemPath = [...path, index];
        const linkId = isObject(child) ? stringField(child, 'linkId') : {};
        visit(child, itemPath, Object.freeze({ pointer: pointerOf(itemPath), ...linkId }), 'item');
      });
    }
  }

  visit(document.resource, [], undefined, 'root');
  return Object.freeze(sites);
}
