/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

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
  it.each(cases)('decodes $escape, with spans covering the literal without gaps', (each) => {
    const { literal, value, sources } = each;
    const decoded = decodeFshString(literal);
    expect(decoded?.value).toBe(value);
    expect(decoded?.spans.map(({ start, end }) => literal.slice(start, end))).toEqual(sources);
    let next = 1;
    for (const { start, end } of decoded?.spans ?? []) {
      expect([start, end > start]).toEqual([next, true]);
      next = end;
    }
    expect(next).toBe(literal.length - 1);
  });

  it.each([
    // SUSHI cannot decode it either.
    ['a \\u escape whose digits include a comma', String.raw`"\u0,41"`, undefined],
    // SUSHI reads the backslash \u005C makes as the start of \n, and decodes a newline.
    ['a \\u escape for a backslash that starts another escape', String.raw`"\u005Cn"`, undefined],
    ['\\u with fewer than four digits, as written', String.raw`"\u41"`, '\\u41'],
  ])('decodes %s', (_, literal, value) => {
    expect(decodeFshString(literal)?.value).toBe(value);
  });
});

describe('decodeFshMultilineString', () => {
  it.each([
    [
      'drops whitespace-only first and last lines and the shared indentation',
      '"""\n    a\n      b\n    """',
      'a\n  b',
    ],
    ['splits CRLF lines and joins them with LF', '"""\r\n  a\r\n  b\r\n"""', 'a\nb'],
    ['keeps a first line with text', '"""a\n  b"""', 'a\n  b'],
    ['empties a whitespace-only line between others', '"""\n  a\n     \n  b\n"""', 'a\n\nb'],
    [
      'decodes \\n, \\r, \\t and \\u but neither \\" nor \\\\',
      String.raw`"""a\nb\tA\"\\"""`,
      'a\nb\tA\\"\\\\',
    ],
    [
      'cannot decode a \\u escape whose digits include a comma',
      String.raw`"""\u,,,,"""`,
      undefined,
    ],
  ])('%s', (_, literal, value) => {
    expect(decodeFshMultilineString(literal)).toBe(value);
  });
});
