import { describe, expect, it } from 'vitest';
import { decodeFshMultilineString, decodeFshString } from '../../src/source/fsh-string.js';

// Literals as they are written in FSH, quotes included. sources lists, for each decoded code unit,
// the source text its span covers; spans are checked to cover the literal without gaps below.
const cases: { escape: string; literal: string; value: string; sources: string[] }[] = [
  { escape: 'none', literal: String.raw`"ab"`, value: 'ab', sources: ['a', 'b'] },
  { escape: 'empty', literal: String.raw`""`, value: '', sources: [] },
  {
    escape: '\\\\',
    literal: String.raw`"a\\b"`,
    value: 'a\\b',
    sources: ['a', String.raw`\\`, 'b'],
  },
  {
    escape: '\\"',
    literal: String.raw`"\"x\""`,
    value: '"x"',
    sources: [String.raw`\"`, 'x', String.raw`\"`],
  },
  {
    escape: '\\n',
    literal: String.raw`"a\nb"`,
    value: 'a\nb',
    sources: ['a', String.raw`\n`, 'b'],
  },
  { escape: '\\r', literal: String.raw`"\r"`, value: '\r', sources: [String.raw`\r`] },
  { escape: '\\t', literal: String.raw`"\t"`, value: '\t', sources: [String.raw`\t`] },
  {
    escape: '\\uXXXX',
    literal: String.raw`"\u0041b"`,
    value: 'Ab',
    sources: [String.raw`\u0041`, 'b'],
  },
  { escape: '\\uxxxx', literal: String.raw`"\u00e9"`, value: 'é', sources: [String.raw`\u00e9`] },
  { escape: 'unknown \\d', literal: String.raw`"\d"`, value: '\\d', sources: ['\\', 'd'] },
  // An escaped backslash before the closing quote: the quote ends the literal.
  { escape: '\\\\"', literal: String.raw`"a\\"`, value: 'a\\', sources: ['a', String.raw`\\`] },
  // \\ is split off first, so the \" after it is still an escaped quote.
  {
    escape: '\\\\\\"',
    literal: String.raw`"\\\""`,
    value: '\\"',
    sources: [String.raw`\\`, String.raw`\"`],
  },
  // \\ is split off first, so the n after it is not an escape.
  { escape: '\\\\n', literal: String.raw`"\\n"`, value: '\\n', sources: [String.raw`\\`, 'n'] },
  {
    escape: 'escaped surrogate pair',
    literal: String.raw`"\uD83D\uDE00"`,
    value: '😀',
    sources: [String.raw`\uD83D`, String.raw`\uDE00`],
  },
  // Each half of a raw surrogate pair is a code unit of its own.
  { escape: 'raw surrogate pair', literal: '"😀"', value: '😀', sources: ['\uD83D', '\uDE00'] },
  {
    escape: 'a \\u escape for a backslash',
    literal: String.raw`"\u005C"`,
    value: '\\',
    sources: [String.raw`\u005C`],
  },
];

describe('decodeFshString', () => {
  it.each(cases)('decodes $escape', ({ literal, value, sources }) => {
    const decoded = decodeFshString(literal);
    expect(decoded?.value).toBe(value);
    expect(decoded?.spans.map(({ start, end }) => literal.slice(start, end))).toEqual(sources);
  });

  it.each(cases)('covers the literal without gaps for $escape', ({ literal }) => {
    const { spans } = decodeFshString(literal) ?? { spans: [] };
    let next = 1;
    for (const { start, end } of spans) {
      expect(start).toBe(next);
      expect(end).toBeGreaterThan(start);
      next = end;
    }
    expect(next).toBe(literal.length - 1);
  });

  it('cannot decode a \\u escape whose digits include a comma, as SUSHI cannot', () => {
    expect(decodeFshString(String.raw`"\u0,41"`)).toBeUndefined();
  });

  // SUSHI reads the backslash \u005C makes as the start of \n, so it decodes \u005Cn to a newline.
  it('does not decode a literal where a \\u escape for a backslash starts another escape', () => {
    expect(decodeFshString(String.raw`"\u005Cn"`)).toBeUndefined();
  });

  it('leaves \\u with fewer than four digits as written', () => {
    expect(decodeFshString(String.raw`"\u41"`)?.value).toBe('\\u41');
  });
});

describe('decodeFshMultilineString', () => {
  it('drops whitespace-only first and last lines and the shared indentation', () => {
    expect(decodeFshMultilineString('"""\n    a\n      b\n    """')).toBe('a\n  b');
  });

  it('splits CRLF lines and joins them with LF', () => {
    expect(decodeFshMultilineString('"""\r\n  a\r\n  b\r\n"""')).toBe('a\nb');
  });

  it('keeps a first line with text', () => {
    expect(decodeFshMultilineString('"""a\n  b"""')).toBe('a\n  b');
  });

  it('empties a whitespace-only line between others', () => {
    expect(decodeFshMultilineString('"""\n  a\n     \n  b\n"""')).toBe('a\n\nb');
  });

  it('decodes \\n, \\r, \\t and \\u but neither \\" nor \\\\', () => {
    expect(decodeFshMultilineString(String.raw`"""a\nb\t\u0041\"\\"""`)).toBe('a\nb\tA\\"\\\\');
  });

  it('cannot decode a \\u escape whose digits include a comma', () => {
    expect(decodeFshMultilineString(String.raw`"""\u,,,,"""`)).toBeUndefined();
  });
});
