// Reads an FSH file into its definitions and their rules, as far as source mapping needs: the
// keyword, name, lines and metadata of each definition, and the indentation, path and value of
// each rule. String values keep their literal and offset, so a decoded expression can be traced
// back to its place in the file. Not a full FSH parser; anything else is kept as raw text.

export interface FshDocument {
  // The file's text without a byte order mark; offsets refer to it.
  readonly text: string;
  // The offset at which each line starts; line n starts at lineStarts[n - 1].
  readonly lineStarts: readonly number[];
  // Alias name, including any $, to its value.
  readonly aliases: ReadonlyMap<string, string>;
  // Every entity except Alias, in file order.
  readonly definitions: readonly FshDefinition[];
}

export interface FshDefinition {
  // Instance, Profile, RuleSet and so on.
  readonly keyword: string;
  // For a RuleSet with parameters, the name without them.
  readonly name: string;
  // One-based: the keyword's line, and the line where the last rule or metadata ends. When that
  // ends with a string spanning lines, the SUSHI index's endLine is the line the string starts on.
  readonly startLine: number;
  readonly endLine: number;
  // Keyword, such as InstanceOf, to its value as written.
  readonly metadata: ReadonlyMap<string, string>;
  readonly rules: readonly FshRule[];
}

// A rule: * at the start of a line, indented by indent spaces.
export type FshRule = { readonly line: number; readonly indent: number } & (
  | { readonly kind: 'assignment'; readonly path: string; readonly value: FshValue }
  // A path on its own, which sets the context of the rules indented under it.
  | { readonly kind: 'path'; readonly path: string }
  // insert RuleSet, or path insert RuleSet, which sets the context like a path.
  | { readonly kind: 'insert'; readonly path?: string }
  // Any other rule, such as a caret rule.
  | { readonly kind: 'other' }
);

export type FshValue =
  // A value that is one "…" or """…""" literal, quotes included, at offset in the text.
  | { readonly kind: 'string'; readonly literal: string; readonly offset: number }
  | { readonly kind: 'other'; readonly text: string };

const entityKeywords = new Set([
  'Alias',
  'Profile',
  'Extension',
  'Logical',
  'Resource',
  'Instance',
  'Invariant',
  'ValueSet',
  'CodeSystem',
  'RuleSet',
  'Mapping',
]);

const metadataKeywords = new Set([
  'Parent',
  'Id',
  'Title',
  'Description',
  'InstanceOf',
  'Usage',
  'Source',
  'Target',
  'Severity',
  'XPath',
  'Expression',
  'Characteristics',
  'Context',
]);

type TokenKind = 'string' | 'comment' | 'word';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
}

// What can start where a token starts. Like SUSHI's lexer, the longest match wins, and the earlier
// pattern on a tie: "a"//b is one word, while // after whitespace starts a comment.
const tokenPatterns: [TokenKind, RegExp][] = [
  ['string', /"""[\s\S]*?"""/y],
  ['string', /"(?:[^\\"]|\\[\s\S])*"/y],
  ['comment', /\/\/[^\n]*/y],
  ['comment', /\/\*[\s\S]*?\*\//y],
  ['word', /\S+/y],
];

function tokenAt(text: string, offset: number): Token {
  let longest: Token = { kind: 'word', text: '', offset };
  for (const [kind, pattern] of tokenPatterns) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text)?.[0] ?? '';
    if (match.length > longest.text.length) longest = { kind, text: match, offset };
  }
  return longest;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < text.length) {
    if (/\s/.test(text.charAt(offset))) {
      offset += 1;
      continue;
    }
    const token = tokenAt(text, offset);
    tokens.push(token);
    offset += token.text.length;
  }
  return tokens;
}

// The one-based line an offset is on.
function lineOf(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

// The tokens of each statement: those that start on one line, comments left out. A string can
// continue onto later lines; tokens after it there start a statement of their own.
function statements(tokens: readonly Token[], lineStarts: readonly number[]): Token[][] {
  const byLine = new Map<number, Token[]>();
  for (const token of tokens) {
    if (token.kind === 'comment') continue;
    const line = lineOf(lineStarts, token.offset);
    byLine.set(line, [...(byLine.get(line) ?? []), token]);
  }
  return [...byLine.values()];
}

function parseRule(tokens: readonly Token[], line: number, indent: number): FshRule {
  const [path, operator, ...value] = tokens;
  if (path === undefined || path.text.startsWith('^')) return { line, indent, kind: 'other' };
  if (path.text === 'insert') return { line, indent, kind: 'insert' };
  if (operator === undefined) return { line, indent, kind: 'path', path: path.text };
  if (operator.text === 'insert') return { line, indent, kind: 'insert', path: path.text };
  if (operator.text !== '=') return { line, indent, kind: 'other' };
  const [only] = value;
  return {
    line,
    indent,
    kind: 'assignment',
    path: path.text,
    value:
      value.length === 1 && only?.kind === 'string'
        ? { kind: 'string', literal: only.text, offset: only.offset }
        : { kind: 'other', text: value.map((token) => token.text).join(' ') },
  };
}

interface OpenDefinition {
  keyword: string;
  name: string;
  startLine: number;
  endLine: number;
  metadata: Map<string, string>;
  rules: FshRule[];
}

export function parseFshDocument(source: string): FshDocument {
  const text = source.startsWith(String.fromCharCode(0xfeff)) ? source.slice(1) : source;
  const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
  const aliases = new Map<string, string>();
  const definitions: OpenDefinition[] = [];
  // The definition the statements belong to; an Alias ends it.
  let current: OpenDefinition | undefined;

  for (const tokens of statements(tokenize(text), lineStarts)) {
    const [first, ...rest] = tokens;
    const last = tokens.at(-1);
    if (first === undefined || last === undefined) continue;
    const line = lineOf(lineStarts, first.offset);
    const endLine = lineOf(lineStarts, last.offset + last.text.length - 1);

    if (first.text === '*') {
      if (current === undefined) continue;
      current.rules.push(parseRule(rest, line, first.offset - (lineStarts[line - 1] ?? 0)));
      current.endLine = endLine;
      continue;
    }

    const written = tokens.map((token) => token.text).join(' ');
    const [, keyword = '', value = ''] = /^([A-Za-z]+)\s*:\s*([\s\S]*)$/.exec(written) ?? [];
    if (keyword === 'Alias') {
      current = undefined;
      const [, name, url] = /^(\S+)\s*=\s*(\S+)$/.exec(value) ?? [];
      if (name !== undefined && url !== undefined) aliases.set(name, url);
    } else if (entityKeywords.has(keyword)) {
      const name = /^[^\s(]+/.exec(value)?.[0] ?? '';
      current = { keyword, name, startLine: line, endLine, metadata: new Map(), rules: [] };
      definitions.push(current);
    } else if (metadataKeywords.has(keyword) && current !== undefined) {
      current.metadata.set(keyword, value);
      current.endLine = endLine;
    }
  }
  return { text, lineStarts, aliases, definitions };
}
