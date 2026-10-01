import { describe, expect, it } from 'vitest';
import { parseJson } from '../src/json.js';

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{ "a": [1, -2.5e3, true, null, "\\u00e9\\n"] }')).toEqual({
      a: [1, -2500, true, null, 'é\n'],
    });
  });

  it.each([
    ['{\n  "files": [,]\n}', 'unexpected "," at line 2, column 13'],
    ['{ "a": 1, }', 'unexpected "}" at line 1, column 11'],
    ['[1, 2', 'unexpected end of file at line 1, column 6'],
    ['', 'unexpected end of file at line 1, column 1'],
    ['{ "a": 1 } x', 'unexpected "x" at line 1, column 12'],
    ['{ a: 1 }', 'unexpected "a" at line 1, column 3'],
    ['"abc', 'unterminated string at line 1, column 5'],
    ['"a\\x"', 'invalid escape in string at line 1, column 3'],
    ['"a\tb"', 'control character in string at line 1, column 3'],
    ['[01]', 'unexpected "1" at line 1, column 3'],
    ['\r\n\r\n  nul', 'unexpected "n" at line 3, column 3'],
  ])('reports the position in %j', (text, message) => {
    expect(() => parseJson(text)).toThrow(message);
  });
});
