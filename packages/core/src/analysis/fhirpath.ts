import fhirpath from 'fhirpath';
import type { ExpressionSite } from '../plugins/types.js';
import type { Summary } from '../report/types.js';

export const FHIRPATH = 'text/fhirpath';

// Whether the FHIRPath syntax check applies to a site: its language is exactly text/fhirpath and
// it has text. Any other language is never parsed as FHIRPath.
export function hasFhirPathText(site: ExpressionSite): site is ExpressionSite & { text: string } {
  return site.language === FHIRPATH && site.text !== undefined;
}

// A FHIRPath syntax error, as far as the parser describes it.
export interface FhirPathSyntaxError {
  // The parser's message for its first error, such as missing ')' at '<EOF>'; absent when the
  // parser failed without one.
  parserMessage?: string;
  // Zero-based UTF-16 offset of that error in the expression text; absent when unknown.
  offset?: number;
}

// fhirpath.js 4.10.1 joins one such line per error with \n. Columns count UTF-16 code units.
const errorLine = /^line: (\d+); column: (\d+); message: (.*)$/m;

// Lines are 1-based and only \n starts one, so \r\n works and a lone \r does not break a line.
function toOffset(text: string, line: number, column: number): number | undefined {
  let start = 0;
  for (let current = 1; current < line; current++) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) return undefined;
    start = newline + 1;
  }
  const offset = start + column;
  return offset <= text.length ? offset : undefined;
}

// A node of the fhirpath.js parse tree, as far as the linter reads it. Positions are 1-based.
interface ParseNode {
  type: string;
  text?: string;
  // On an ExternalConstantTerm written %`name` or %'name': the name without backticks, or the
  // string literal with its quotes.
  delimitedText?: string;
  start?: { line: number; column: number };
  children?: ParseNode[];
}

// Parses text with the pinned fhirpath.js: the parse tree, or what the parser threw. The only use
// of fhirpath.js in the linter.
function parse(text: string): { tree: ParseNode } | { error: unknown } {
  try {
    return { tree: fhirpath.parse(text) as ParseNode };
  } catch (error) {
    // Deeply nested valid input can overflow the parser's stack; that is a linter failure, not a
    // syntax error in the expression.
    if (error instanceof RangeError) throw error;
    return { error };
  }
}

// The syntax error in text, or undefined when it parses.
export function checkFhirPathSyntax(text: string): FhirPathSyntaxError | undefined {
  const parsed = parse(text);
  if ('tree' in parsed) return undefined;
  const message = parsed.error instanceof Error ? parsed.error.message : '';
  const match = errorLine.exec(message);
  // Some invalid input, such as a.b..c, makes the parser itself throw without a position.
  if (match?.index !== 0) return {};
  const [, line = '', column = '', parserMessage = ''] = match;
  const offset = toOffset(text, Number(line), Number(column));
  return { parserMessage, ...(offset === undefined ? {} : { offset }) };
}

// One function call in a FHIRPath expression.
export interface FunctionCall {
  name: string;
  // Zero-based UTF-16 offsets of the name in the expression text.
  startOffset: number;
  endOffset: number;
}

function child(node: ParseNode | undefined, type: string): ParseNode | undefined {
  return node?.children?.find((candidate) => candidate.type === type);
}

// fhirpath.js resolves a call on these constants against the constant's own functions, not the
// engine's.
const ownFunctions: ReadonlySet<string> = new Set(['factory', 'terminologies']);

// The constant a target term names, read as fhirpath.js reads it; parentheses are looked through.
function constantName(term: ParseNode | undefined): string | undefined {
  const parenthesized = child(term, 'ParenthesizedTerm');
  if (parenthesized !== undefined) return constantName(child(parenthesized, 'TermExpression'));
  const constant = child(term, 'ExternalConstantTerm');
  const delimited = constant?.delimitedText;
  return delimited === undefined ? constant?.text : delimited.replace(/^'(.*)'$/s, '$1');
}

// Whether fhirpath.js resolves a FunctionInvocation against its target's own functions: the call
// follows a target in an InvocationExpression, and the target is one of those constants.
function onOwnFunctions(call: ParseNode, parent: ParseNode | undefined): boolean {
  const target = parent?.children?.[0];
  return (
    parent?.type === 'InvocationExpression' &&
    target !== call &&
    ownFunctions.has(constantName(target) ?? '')
  );
}

// The call a FunctionInvocation makes. fhirpath.js strips the backticks of a delimited name, then
// decodes its escape sequences; a name with one gives undefined rather than a guess.
function toCall(text: string, call: ParseNode): FunctionCall | undefined {
  const { text: written, start } = child(child(call, 'Functn'), 'Identifier') ?? {};
  if (written === undefined || start === undefined) {
    throw new Error(`fhirpath.js gave a function call without a name: ${text}`);
  }
  // Parse tree columns are 1-based; toOffset takes the parser's 0-based error columns.
  const startOffset = toOffset(text, start.line, start.column - 1);
  if (startOffset === undefined) {
    throw new Error(`fhirpath.js gave a function call outside the text: ${text}`);
  }
  const name = /^`(.*)`$/s.exec(written)?.[1] ?? written;
  if (name.includes('\\')) return undefined;
  // The range covers the name as written, backticks included.
  return { name, startOffset, endOffset: startOffset + written.length };
}

// The function calls in text, in source order, or undefined when it does not parse.
export function findFunctionCalls(text: string): FunctionCall[] | undefined {
  const parsed = parse(text);
  if (!('tree' in parsed)) return undefined;
  const calls: FunctionCall[] = [];
  // Pre-order: a call comes before the calls in its arguments, which come before later calls.
  const visit = (node: ParseNode, parent?: ParseNode): void => {
    if (node.type === 'FunctionInvocation' && !onOwnFunctions(node, parent)) {
      const call = toCall(text, node);
      if (call !== undefined) calls.push(call);
    }
    for (const next of node.children ?? []) visit(next, node);
  };
  visit(parsed.tree);
  return calls;
}

// Approximates report-format.md § Run metadata and summary while FHIRPath syntax is the only
// check: catalogued FHIRPath sites with text are analysed; uncatalogued sites still lack scope
// analysis, and other languages have no analysis. Revisit when a second check is added.
export function countExpressions(sites: readonly ExpressionSite[]): Summary['expressions'] {
  const analysed = sites.filter((site) => site.catalogued && hasFhirPathText(site)).length;
  return { analysed, unchecked: sites.length - analysed };
}
