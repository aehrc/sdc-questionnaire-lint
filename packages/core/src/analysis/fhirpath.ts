import fhirpath from 'fhirpath';
import type { ExpressionSite } from './expression-site.js';

export const FHIRPATH = 'text/fhirpath';

// Whether the FHIRPath syntax check applies to a site: its language is exactly text/fhirpath and
// it has text. Any other language is never parsed as FHIRPath.
export function hasFhirPathText(site: ExpressionSite): site is ExpressionSite & { text: string } {
  return site.language === FHIRPATH && site.text !== undefined;
}

// A FHIRPath syntax problem, as far as the parser describes it.
export interface FhirPathSyntaxProblem {
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

// The syntax problem in text, or undefined when it parses.
export function findFhirPathSyntaxProblem(text: string): FhirPathSyntaxProblem | undefined {
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

// One %name reference in a FHIRPath expression.
export interface VariableReference {
  // The name fhirpath.js looks up.
  readonly name: string;
  // Zero-based UTF-16 offsets of the reference as written: the %, any whitespace or comments after
  // it, and the name with its backticks or quotes.
  readonly startOffset: number;
  readonly endOffset: number;
  // False when an earlier step of its chain is a defineVariable with a computed name, which may
  // bind it.
  readonly complete: boolean;
}

// A string literal's value, decoded as fhirpath.js decodes it; anything without both quotes is
// kept, as fhirpath.js keeps the name of %`a`.
function stringValue(literal: string): string {
  if (!/^'.*'$/s.test(literal)) return literal;
  // Like fhirpath.js, . does not match a line break, so a backslash before one is kept.
  return literal.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
    if (escape.length > 1) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return { r: '\r', n: '\n', t: '\t', f: '\f' }[escape] ?? escape;
  });
}

// The offset after the whitespace and comments at offset.
function skipTrivia(text: string, offset: number): number {
  let at = offset;
  for (;;) {
    if (/[ \t\r\n]/.test(text[at] ?? '')) at++;
    else if (text.startsWith('/*', at)) at = text.indexOf('*/', at + 2) + 2;
    else if (text.startsWith('//', at)) at += text.slice(at).search(/[\r\n]|$/);
    else return at;
  }
}

// The offset after the string literal that starts at offset.
function skipString(text: string, offset: number): number {
  let at = offset + 1;
  while (text[at] !== "'") at += text[at] === '\\' ? 2 : 1;
  return at + 1;
}

// The reference an ExternalConstantTerm makes. Its length does not give the end: it excludes the %
// and backticks, and anything between the % and the name.
function toReference(text: string, term: ParseNode): Omit<VariableReference, 'complete'> {
  const name = term.delimitedText === undefined ? term.text : stringValue(term.delimitedText);
  const startOffset =
    term.start === undefined ? undefined : toOffset(text, term.start.line, term.start.column - 1);
  if (name === undefined || startOffset === undefined) {
    throw new Error(`fhirpath.js gave a reference without a name or position: ${text}`);
  }
  // A name written as a string literal has no Identifier, so its end is found by scanning.
  const identifier = child(child(term, 'ExternalConstant'), 'Identifier');
  const identifierStart =
    identifier?.start === undefined
      ? undefined
      : toOffset(text, identifier.start.line, identifier.start.column - 1);
  const endOffset =
    identifierStart === undefined || identifier?.text === undefined
      ? skipString(text, skipTrivia(text, startOffset + 1))
      : identifierStart + identifier.text.length;
  return { name, startOffset, endOffset };
}

// The names defineVariable has bound for the later steps of a chain, and whether one of them was
// computed, so that it may bind any name.
interface LocalNames {
  names: Set<string>;
  computed: boolean;
}

const copy = ({ names, computed }: LocalNames): LocalNames => ({ names: new Set(names), computed });

// The nodes whose children fhirpath.js evaluates in order in one context, so that a defineVariable
// in one child binds its name in the later ones. Every other node evaluates its operands, and a
// function its arguments, each in its own copy of the context.
const sharedContext: ReadonlySet<string> = new Set([
  'EntireExpression',
  'InvocationExpression',
  'InvocationTerm',
  'TermExpression',
  'ParenthesizedTerm',
  'PolarityExpression',
  'IndexerExpression',
]);

// The value of an argument written as a string literal, or undefined for any other argument.
function literalString(argument: ParseNode | undefined): string | undefined {
  const literal = child(child(argument, 'LiteralTerm'), 'StringLiteral')?.text;
  return argument?.type === 'TermExpression' && literal !== undefined
    ? stringValue(literal)
    : undefined;
}

// The %name references in text, in source order, or undefined when it does not parse. A name that
// defineVariable binds for the reference is left out (core-rules.md, slice 4a).
export function findVariableReferences(text: string): VariableReference[] | undefined {
  const parsed = parse(text);
  if (!('tree' in parsed)) return undefined;
  const references: VariableReference[] = [];
  const visit = (node: ParseNode, local: LocalNames): void => {
    if (node.type === 'ExternalConstantTerm') {
      const reference = toReference(text, node);
      if (!local.names.has(reference.name))
        references.push({ ...reference, complete: !local.computed });
      return;
    }
    if (node.type !== 'FunctionInvocation') {
      const shared = sharedContext.has(node.type);
      for (const next of node.children ?? []) visit(next, shared ? local : copy(local));
      return;
    }
    const args = child(child(node, 'Functn'), 'ParamList')?.children ?? [];
    for (const argument of args) visit(argument, copy(local));
    // fhirpath.js accepts one or two arguments, and binds the name after evaluating them. A call
    // whose name has an escape sequence may be defineVariable, so it counts as a computed name.
    const call = toCall(text, node);
    if (
      (call !== undefined && call.name !== 'defineVariable') ||
      args.length < 1 ||
      args.length > 2
    ) {
      return;
    }
    const name = call === undefined ? undefined : literalString(args[0]);
    if (name === undefined) local.computed = true;
    else local.names.add(name);
  };
  visit(parsed.tree, { names: new Set(), computed: false });
  return references;
}

// A linkId written as a string literal in where(linkId = '…').
export interface LinkIdLiteral {
  linkId: string;
  // Zero-based UTF-16 offsets of the string literal, quotes included.
  startOffset: number;
  endOffset: number;
}

// The linkId references in a FHIRPath expression: where(linkId = …) on a collection (core-rules.md,
// slice 7).
export interface LinkIdReferences {
  // The literal linkIds selected from items of this form, in source order. A deliberate absence
  // probe is left out.
  literals: LinkIdLiteral[];
  // Whether a reference other than an absence probe has a target or linkId that is not
  // established.
  uncertain: boolean;
}

// What a site establishes as items of this form: the names of the %constants that are, and
// whether its input, the implicit focus at the top of the expression, is.
export interface LinkIdTargets {
  roots: ReadonlySet<string>;
  focus: boolean;
}

interface Selector {
  literal?: LinkIdLiteral;
  // Whether its input is established as items of this form.
  established: boolean;
  probe: boolean;
}

// What the walk knows of a value: whether it is established as nodes of this form (the
// Questionnaire, the response, their items and answers), the selectors whose items flow into it
// through item steps, and, for a count(), the selectors whose items it counts.
interface Value {
  form: boolean;
  chain: Selector[];
  counted?: Selector[];
}

const unknown: Value = { form: false, chain: [] };

// The functions whose arguments are evaluated on each item of their input, or on the input itself
// for iif. Any other function's arguments get an input that is not established.
const focusedArguments: ReadonlySet<string> = new Set([
  'where',
  'select',
  'repeat',
  'exists',
  'all',
  'iif',
]);

// The name of a member or function as fhirpath.js reads it, without backticks.
function identifierName(node: ParseNode | undefined): string | undefined {
  const text = child(node, 'Identifier')?.text;
  return text === undefined ? undefined : (/^`(.*)`$/s.exec(text)?.[1] ?? text);
}

// Whether a node is the member linkId on its own, as written in where(linkId = …).
function isLinkIdMember(node: ParseNode | undefined): boolean {
  const member = child(child(node, 'InvocationTerm'), 'MemberInvocation');
  return node?.type === 'TermExpression' && identifierName(member) === 'linkId';
}

// The linkId references in text, or undefined when it does not parse. Only where(linkId = …) with
// linkId on one side of = is a reference; the input of the where must be established through the
// roots, the focus, item, answer, repeat, where and select.
export function findLinkIdReferences(
  text: string,
  { roots, focus }: LinkIdTargets,
): LinkIdReferences | undefined {
  const parsed = parse(text);
  if (!('tree' in parsed)) return undefined;
  const selectors: Selector[] = [];

  // A where's argument, when it compares linkId with =: the literal it compares with, if any.
  const comparison = (argument: ParseNode | undefined): { literal?: LinkIdLiteral } | undefined => {
    if (argument?.type !== 'EqualityExpression' || argument.text !== '=') return undefined;
    const [left, right] = argument.children ?? [];
    const other = isLinkIdMember(left) ? right : isLinkIdMember(right) ? left : undefined;
    if (other === undefined) return undefined;
    // The position is on the LiteralTerm, the text on both.
    const term = child(other, 'LiteralTerm');
    const { text: written, start } = term ?? {};
    if (
      other.type !== 'TermExpression' ||
      child(term, 'StringLiteral') === undefined ||
      written === undefined
    ) {
      return {};
    }
    const startOffset =
      start === undefined ? undefined : toOffset(text, start.line, start.column - 1);
    if (startOffset === undefined) {
      throw new Error(`fhirpath.js gave a string literal without a position: ${text}`);
    }
    return {
      literal: {
        linkId: stringValue(written),
        startOffset,
        endOffset: startOffset + written.length,
      },
    };
  };

  const probe = (chain: readonly Selector[] | undefined): void => {
    for (const selector of chain ?? []) selector.probe = true;
  };

  const invoke = (invocation: ParseNode, input: Value, current: Value): Value => {
    if (invocation.type === 'ThisInvocation') return current;
    if (invocation.type === 'MemberInvocation') {
      const name = identifierName(invocation);
      if (name === 'item') return input;
      return name === 'answer' ? { form: input.form, chain: [] } : unknown;
    }
    if (invocation.type !== 'FunctionInvocation') return unknown;
    const functn = child(invocation, 'Functn');
    const name = identifierName(functn);
    const args = child(functn, 'ParamList')?.children ?? [];
    // Only repeat's argument continues the chain of its input: the items it gives are reached
    // from those through the argument's steps.
    const argumentInput: Value =
      name === 'repeat'
        ? input
        : name !== undefined && focusedArguments.has(name)
          ? { form: input.form, chain: [] }
          : unknown;
    const values = args.map((argument) => visit(argument, argumentInput));
    switch (name) {
      case 'where': {
        const compared = args.length === 1 ? comparison(args[0]) : undefined;
        if (compared === undefined) return input;
        const selector: Selector = {
          ...compared,
          established: input.form,
          probe: false,
        };
        selectors.push(selector);
        return { form: input.form, chain: [...input.chain, selector] };
      }
      case 'repeat':
        return values[0]?.form === true ? { form: input.form, chain: values[0].chain } : unknown;
      case 'select':
        return { form: values[0]?.form === true && input.form, chain: [] };
      case 'exists':
      case 'empty':
        probe(input.chain);
        return unknown;
      case 'count':
        return { ...unknown, counted: input.chain };
      default:
        return unknown;
    }
  };

  // The value of node with current as its input.
  const visit = (node: ParseNode, current: Value): Value => {
    const [first, second] = node.children ?? [];
    switch (node.type) {
      case 'EntireExpression':
      case 'ParenthesizedTerm':
        return first === undefined ? unknown : visit(first, current);
      case 'TermExpression': {
        if (first?.type === 'ExternalConstantTerm') {
          return { form: roots.has(constantName(node) ?? ''), chain: [] };
        }
        if (first?.type === 'InvocationTerm') {
          const invocation = first.children?.[0];
          return invocation === undefined ? unknown : invoke(invocation, current, current);
        }
        return first === undefined ? unknown : visit(first, current);
      }
      case 'InvocationExpression':
        return first === undefined || second === undefined
          ? unknown
          : invoke(second, visit(first, current), current);
      case 'UnionExpression': {
        const values = (node.children ?? []).map((operand) => visit(operand, current));
        return {
          form: values.every(({ form }) => form),
          chain: values.flatMap(({ chain }) => chain),
        };
      }
      case 'EqualityExpression':
      case 'InequalityExpression':
        for (const operand of node.children ?? []) probe(visit(operand, current).counted);
        return unknown;
      default:
        for (const next of node.children ?? []) visit(next, current);
        return unknown;
    }
  };

  visit(parsed.tree, { form: focus, chain: [] });
  const references = selectors.filter((selector) => !selector.probe);
  return {
    literals: references.flatMap(({ literal, established }) =>
      established && literal !== undefined ? [literal] : [],
    ),
    uncertain: references.some(({ literal, established }) => !established || literal === undefined),
  };
}
