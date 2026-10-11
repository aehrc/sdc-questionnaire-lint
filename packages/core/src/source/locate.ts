import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import { getOrSet } from '../cache.js';
import { displayPath } from '../inputs/paths.js';
import type { AnalysedDocument } from '../inputs/read.js';
import { valueAt } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { ExpressionExcerpt, SourceLocation, SourceMapResult } from '../report/types.js';
import { resourceAt } from '../run/rules.js';
import { findDefinition, type DefinitionLookup, type LookupTarget } from './definitions.js';
import {
  expressionLiterals,
  namesExtension,
  type ExpressionLiteral,
} from './expression-literals.js';
import type { FshDefinition } from './fsh-document.js';
import type { FshFile, FshFiles } from './fsh-files.js';
import { decodeFshMultilineString, decodeFshString } from './fsh-string.js';
import { positionAt } from './positions.js';
import type { SushiIndexEntry } from './sushi-index.js';

// Locates a finding's expression in the FSH Instance it was compiled from (core-plan §7.1 and
// plan-amendments.md § From the source-mapping design). Text that occurs once in the resource's
// JSON and once in the Instance maps exactly, when the literal's item linkId, extension and
// Expression name are the expression's. Repeated text maps only when those anchors single out one
// literal and one expression; otherwise, and whenever the evidence is missing, the finding keeps
// its JSON location and a reason.

// The mapper needs a document's sites, not core's analysis of it.
type MappedDocument = Pick<AnalysedDocument, 'input' | 'document' | 'sites'>;

export interface LocateTarget {
  readonly document: MappedDocument;
  readonly site: ExpressionSite | undefined;
  // The finding's excerpt: the site's expression, or a fragment's whole query, with the reported
  // range in it.
  readonly expression: ExpressionExcerpt | undefined;
}

// What one run maps against. Findings in one resource share its definition, so each resource's
// definition is looked up once.
export interface SourceContext {
  readonly files: FshFiles;
  // Canonical; source locations are shown relative to it.
  readonly cwd: string;
  definitionOf(target: LookupTarget): Promise<DefinitionLookup>;
}

export function sourceContext(
  index: readonly SushiIndexEntry[],
  files: FshFiles,
  cwd: string,
): SourceContext {
  const definitions = new Map<string, Promise<DefinitionLookup>>();
  return {
    files,
    cwd,
    definitionOf: (target) =>
      getOrSet(definitions, JSON.stringify([target.inputPath, target.resource.pointer]), () =>
        findDefinition(target, index, files),
      ),
  };
}

type UnmappedReason = Extract<SourceMapResult, { status: 'unmapped' }>['reason'];

export function unmapped(reason: UnmappedReason): SourceMapResult {
  return { status: 'unmapped', reason };
}

function decode(literal: string): string | undefined {
  return literal.startsWith('"""')
    ? decodeFshMultilineString(literal)
    : decodeFshString(literal)?.value;
}

function isMultiline(literal: string): boolean {
  return literal.startsWith('"""') || literal.includes('\n');
}

// What identifies an expression in the JSON without array indices, as ExpressionLiteral does in
// FSH. The url is the extension holding the Expression.
interface Anchors {
  readonly linkId: string | undefined;
  readonly element: string | undefined;
  readonly url: string | undefined;
  readonly subExtension: string | undefined;
  readonly name: string | undefined;
}

const indexPattern = /^[0-9]+$/;

function isExtensionKey(segment: string | undefined): boolean {
  return segment === 'extension' || segment === 'modifierExtension';
}

// A site's anchors, read from the JSON path from the resource it is in to its Expression as
// ExpressionLiteral reads them from the FSH path: the linkId of the innermost leading item, the
// primitive element whose _element companion holds the extension, and the urls of the first two
// extensions. Read this way, they are the same for a catalogued and an uncatalogued site, and for
// a site in a contained resource, which has no item of its own.
function anchorsOf(document: QuestionnaireDocument, site: ExpressionSite): Anchors {
  const { resource, resourcePointer } = document;
  // Below the root resource: "" for the root, /contained/0 for a contained resource.
  const inRoot = resourceAt(document, site.pointer).pointer.slice(resourcePointer.length);
  // Escaped tokens; the first segment, before the leading slash, is dropped.
  const below = site.expressionPointer
    .slice(resourcePointer.length + inRoot.length)
    .split('/')
    .slice(1);
  const valueBelow = (count: number): unknown =>
    valueAt(resource, [inRoot, ...below.slice(0, count)].join('/'));

  let position = 0;
  let linkId: string | undefined;
  while (below[position] === 'item' && indexPattern.test(below[position + 1] ?? '')) {
    position += 2;
    const item = valueBelow(position);
    linkId = isObject(item) && typeof item.linkId === 'string' ? item.linkId : undefined;
  }
  const holder = below[position];
  const element =
    holder?.startsWith('_') === true && isExtensionKey(below[position + 1])
      ? holder.slice(1)
      : undefined;
  const [url, subExtension] = below.flatMap((segment, index) => {
    if (!isExtensionKey(segment)) return [];
    const extension = valueBelow(index + 2);
    return [isObject(extension) && typeof extension.url === 'string' ? extension.url : undefined];
  });
  return { linkId, element, url, subExtension, name: site.name };
}

function sameAnchors(a: Anchors, b: Anchors): boolean {
  return (
    a.linkId === b.linkId &&
    a.element === b.element &&
    a.url === b.url &&
    a.subExtension === b.subExtension &&
    a.name === b.name
  );
}

// An expression in the JSON, with the resource it is in and its anchors.
interface JsonExpression {
  readonly site: ExpressionSite;
  readonly resource: string;
  readonly anchors: Anchors;
}

function groupJsonExpressions({ document, sites }: MappedDocument): Map<string, JsonExpression[]> {
  const grouped = new Map<string, JsonExpression[]>();
  for (const site of sites) {
    if (site.carrier === 'fragment' || site.text === undefined) continue;
    const expression = {
      site,
      resource: resourceAt(document, site.pointer).pointer,
      anchors: anchorsOf(document, site),
    };
    const group = grouped.get(site.text);
    if (group === undefined) grouped.set(site.text, [expression]);
    else group.push(expression);
  }
  return grouped;
}

// Keyed by sites: the coverage script builds a new MappedDocument for each site.
const jsonExpressions = new WeakMap<
  readonly ExpressionSite[],
  ReadonlyMap<string, readonly JsonExpression[]>
>();

function expressionsWithText(document: MappedDocument, text: string): readonly JsonExpression[] {
  return (
    getOrSet(jsonExpressions, document.sites, () => groupJsonExpressions(document)).get(text) ?? []
  );
}

function groupLiterals(definition: FshDefinition): Map<string, ExpressionLiteral[]> {
  const grouped = new Map<string, ExpressionLiteral[]>();
  for (const literal of expressionLiterals(definition)) {
    const value = decode(literal.literal);
    if (value === undefined) continue;
    const group = grouped.get(value);
    if (group === undefined) grouped.set(value, [literal]);
    else group.push(literal);
  }
  return grouped;
}

const definitionLiterals = new WeakMap<
  FshDefinition,
  ReadonlyMap<string, readonly ExpressionLiteral[]>
>();

function literalsWithText(definition: FshDefinition, text: string): readonly ExpressionLiteral[] {
  return getOrSet(definitionLiterals, definition, () => groupLiterals(definition)).get(text) ?? [];
}

const noAliases: ReadonlyMap<string, string> = new Map();

// Whether a name could match a url only through an alias.
function needsAlias(name: string | undefined, url: string | undefined): boolean {
  return name !== undefined && url !== undefined && !namesExtension(name, url, noAliases);
}

// Whether a literal's anchors are those of the expression. Evidence on one side only is a
// mismatch, so a literal whose linkId the definition does not assign never matches an item's.
function literalMatches(
  literal: ExpressionLiteral,
  anchors: Anchors,
  aliases: ReadonlyMap<string, string>,
): boolean {
  const extensionMatches = (name: string | undefined, url: string | undefined): boolean =>
    name === undefined || url === undefined ? name === url : namesExtension(name, url, aliases);
  return (
    literal.linkId === anchors.linkId &&
    literal.element === anchors.element &&
    literal.name === anchors.name &&
    extensionMatches(literal.extension, anchors.url) &&
    extensionMatches(literal.subExtension, anchors.subExtension)
  );
}

// The site a finding is located by: a fragment's is the expression whose query holds it, which
// also holds the Expression's name.
export function expressionOwner(
  sites: readonly ExpressionSite[],
  site: ExpressionSite,
): ExpressionSite | undefined {
  return site.carrier === 'fragment'
    ? sites.find(
        (each) => each.carrier !== 'fragment' && each.expressionPointer === site.expressionPointer,
      )
    : site;
}

// Where the reported range of the expression lies in the file. The literal is decoded to learn
// where each character came from, and the source of the range is decoded again; when either is
// not the expression's text, there is no location.
function locationOf(
  { literal: written, offset }: ExpressionLiteral,
  { text, range = { startOffset: 0, endOffset: text.length } }: ExpressionExcerpt,
  file: FshFile,
  cwd: string,
): SourceLocation | undefined {
  const decoded = decodeFshString(written);
  if (decoded?.value !== text) return undefined;

  const { startOffset, endOffset } = range;
  // Offsets into the literal; the closing quote's when the range is empty at the end.
  const start = decoded.spans[startOffset]?.start ?? written.length - 1;
  const end = endOffset > startOffset ? (decoded.spans[endOffset - 1]?.end ?? start) : start;
  if (
    decodeFshString(`"${written.slice(start, end)}"`)?.value !== text.slice(startOffset, endOffset)
  ) {
    return undefined;
  }

  const { lineStarts } = file.document;
  const from = positionAt(lineStarts, offset + start);
  const to = positionAt(lineStarts, offset + end);
  return {
    file: displayPath(file.path, cwd),
    line: from.line,
    column: from.column,
    endLine: to.line,
    endColumn: to.column,
  };
}

export async function locateExpression(
  { document, site, expression }: LocateTarget,
  context: SourceContext,
): Promise<SourceMapResult> {
  if (site === undefined || expression === undefined) return unmapped('not-found');
  const owner = expressionOwner(document.sites, site);
  if (owner === undefined) return unmapped('not-found');

  const resource = resourceAt(document.document, owner.pointer);
  const found = await context.definitionOf({ resource, inputPath: document.input.path });
  if ('reason' in found) return unmapped(found.reason);

  const { text } = expression;
  const inJson = expressionsWithText(document, text).filter(
    (each) => each.resource === resource.pointer,
  );
  const inFsh = literalsWithText(found.definition, text);
  const [only] = inFsh;
  if (only === undefined) return unmapped('not-found');
  const unique = inJson.length === 1 && inFsh.length === 1;
  // Text written once, in a multi-line literal, is reported as such whatever the literal's
  // anchors: those of an item whose linkId a RuleSet assigns are missing (plan-amendments.md).
  if (unique && isMultiline(only.literal)) return unmapped('multiline');
  // Rules a RuleSet inserts are not in the definition, and they shift its soft indices.
  if (!unique && found.definition.rules.some(({ kind }) => kind === 'insert')) {
    return unmapped('ambiguous');
  }

  // Unique text maps only to a literal with the expression's anchors: the one literal may be
  // another Expression's, when a RuleSet wrote the text in the JSON.
  const anchors = anchorsOf(document.document, owner);
  // Every FSH file is read for its aliases, so only when a literal could name its extension by
  // one.
  const aliases = inFsh.some(
    (literal) =>
      needsAlias(literal.extension, anchors.url) ||
      needsAlias(literal.subExtension, anchors.subExtension),
  )
    ? await context.files.aliases()
    : noAliases;
  const fsh = inFsh.filter((literal) => literalMatches(literal, anchors, aliases));
  const json = inJson.filter((each) => sameAnchors(each.anchors, anchors));
  const [selected] = fsh;
  if (selected === undefined || fsh.length !== 1 || json.length !== 1) {
    return unmapped(unique ? 'not-found' : 'ambiguous');
  }
  if (isMultiline(selected.literal)) return unmapped('multiline');

  const location = locationOf(selected, expression, found.file, context.cwd);
  return location === undefined
    ? unmapped('not-found')
    : { status: 'mapped', confidence: unique ? 'exact' : 'anchored', location };
}
