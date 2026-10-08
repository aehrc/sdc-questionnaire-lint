import type { ExpressionSite } from '../analysis/expression-site.js';
import { displayPath } from '../inputs/paths.js';
import type { AnalysedDocument } from '../inputs/read.js';
import { valueAt } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { ExpressionExcerpt, SourceLocation, SourceMapResult } from '../report/types.js';
import { resourceAt } from '../run/rules.js';
import { findDefinition } from './definitions.js';
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
// JSON and once in the Instance maps exactly. Repeated text maps only when the item's linkId, the
// extension and the Expression's name single out one literal and one expression; otherwise, and
// whenever the evidence is missing, the finding keeps its JSON location and a reason.

export interface LocateTarget {
  readonly document: AnalysedDocument;
  readonly site: ExpressionSite | undefined;
  // The finding's excerpt: the site's expression, or a fragment's whole query, with the reported
  // range in it.
  readonly expression: ExpressionExcerpt | undefined;
}

export interface SourceContext {
  readonly index: readonly SushiIndexEntry[];
  readonly files: FshFiles;
  // Canonical; source locations are shown relative to it.
  readonly cwd: string;
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

function anchorsOf({ document }: AnalysedDocument, site: ExpressionSite): Anchors {
  let url = site.location?.url;
  // An uncatalogued site's extension is the object holding its Expression, when it has a url.
  if (url === undefined) {
    const expression = site.expressionPointer.slice(document.resourcePointer.length);
    const holder = valueAt(document.resource, expression.replace(/\/[^/]*$/, ''));
    if (isObject(holder) && typeof holder.url === 'string') url = holder.url;
  }
  return {
    linkId: site.item?.linkId,
    element: site.element,
    url,
    subExtension: site.location?.subExtension,
    name: site.name,
  };
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

async function allAliases(files: FshFiles): Promise<Map<string, string>> {
  return new Map((await files.all()).flatMap(({ document }) => [...document.aliases]));
}

// Where the reported range of the expression lies in the file. The literal is read again from the
// file and decoded, and so is the source of the range; when either is not the expression's text,
// there is no location.
function locationOf(
  literal: ExpressionLiteral,
  { text, range = { startOffset: 0, endOffset: text.length } }: ExpressionExcerpt,
  file: FshFile,
  cwd: string,
): SourceLocation | undefined {
  const { text: source, lineStarts } = file.document;
  const written = source.slice(literal.offset, literal.offset + literal.literal.length);
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

  const from = positionAt(lineStarts, literal.offset + start);
  const to = positionAt(lineStarts, literal.offset + end);
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
  if ((await context.files.directories()).length === 0) return unmapped('source-unavailable');
  if (site === undefined || expression === undefined) return unmapped('not-found');
  // A fragment is found through its query, which also holds the Expression's name.
  const owner =
    site.carrier === 'fragment'
      ? document.sites.find(
          (each) =>
            each.carrier !== 'fragment' && each.expressionPointer === site.expressionPointer,
        )
      : site;
  if (owner === undefined) return unmapped('not-found');

  const resource = resourceAt(document.document, owner.pointer);
  const found = await findDefinition(
    { resource, inputPath: document.input.path },
    context.index,
    context.files,
  );
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

  let selected: ExpressionLiteral | undefined;
  let confidence: 'exact' | 'anchored';
  if (inJson.length === 1 && inFsh.length === 1) {
    [selected] = inFsh;
    confidence = 'exact';
  } else {
    if (inFsh.length === 0) return unmapped('not-found');
    // Rules a RuleSet inserts are not in the definition, and they shift its soft indices.
    if (found.definition.rules.some(({ kind }) => kind === 'insert')) return unmapped('ambiguous');
    const anchors = anchorsOf(document, owner);
    const aliases = await allAliases(context.files);
    const fsh = inFsh.filter((literal) => literalMatches(literal, anchors, aliases));
    const json = inJson.filter((each) => sameAnchors(anchorsOf(document, each), anchors));
    if (fsh.length !== 1 || json.length !== 1) return unmapped('ambiguous');
    [selected] = fsh;
    confidence = 'anchored';
  }
  if (selected === undefined) return unmapped('not-found');
  if (isMultiline(selected.literal)) return unmapped('multiline');

  const location = locationOf(selected, expression, found.file, context.cwd);
  return location === undefined
    ? unmapped('not-found')
    : { status: 'mapped', confidence, location };
}
