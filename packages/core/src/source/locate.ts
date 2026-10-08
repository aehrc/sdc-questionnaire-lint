import type { ExpressionSite } from '../analysis/expression-site.js';
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

export interface LocateTarget {
  readonly document: AnalysedDocument;
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
    definitionOf(target) {
      const key = JSON.stringify([target.inputPath, target.resource.pointer]);
      let lookup = definitions.get(key);
      if (lookup === undefined) {
        lookup = findDefinition(target, index, files);
        definitions.set(key, lookup);
      }
      return lookup;
    },
  };
}

type UnmappedReason = Extract<SourceMapResult, { status: 'unmapped' }>['reason'];

function unmapped(reason: UnmappedReason): SourceMapResult {
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

// The urls of the extensions on the way from the resource to an uncatalogued site's Expression.
// As in ExpressionLiteral, the first is the extension and the second the sub-extension.
function extensionUrls(
  { resource, resourcePointer }: AnalysedDocument['document'],
  site: ExpressionSite,
): (string | undefined)[] {
  // The first segment is the empty one before the leading slash.
  const segments = site.expressionPointer.slice(resourcePointer.length).split('/');
  return segments.flatMap((segment, position) => {
    if (segment !== 'extension' && segment !== 'modifierExtension') return [];
    const extension = valueAt(resource, segments.slice(0, position + 2).join('/'));
    return [isObject(extension) && typeof extension.url === 'string' ? extension.url : undefined];
  });
}

function anchorsOf({ document }: AnalysedDocument, site: ExpressionSite): Anchors {
  const [url, subExtension] =
    site.location === undefined
      ? extensionUrls(document, site)
      : [site.location.url, site.location.subExtension];
  return { linkId: site.item?.linkId, element: site.element, url, subExtension, name: site.name };
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
  const inJson = document.sites.filter(
    (each) =>
      each.carrier !== 'fragment' &&
      each.text === text &&
      resourceAt(document.document, each.pointer).pointer === resource.pointer,
  );
  const inFsh = expressionLiterals(found.definition).filter(
    (literal) => decode(literal.literal) === text,
  );
  if (inFsh.length === 0) return unmapped('not-found');
  const unique = inJson.length === 1 && inFsh.length === 1;
  // Rules a RuleSet inserts are not in the definition, and they shift its soft indices.
  if (!unique && found.definition.rules.some(({ kind }) => kind === 'insert')) {
    return unmapped('ambiguous');
  }

  // Unique text maps only to a literal with the expression's anchors: the one literal may be
  // another Expression's, when a RuleSet wrote the text in the JSON.
  const anchors = anchorsOf(document, owner);
  const aliases = await context.files.aliases();
  const fsh = inFsh.filter((literal) => literalMatches(literal, anchors, aliases));
  const json = inJson.filter((each) => sameAnchors(anchorsOf(document, each), anchors));
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
