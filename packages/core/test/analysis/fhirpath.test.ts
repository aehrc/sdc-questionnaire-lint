import fhirpath from 'fhirpath';
import { describe, expect, it } from 'vitest';

// sdc/parse-error reads positions out of fhirpath.js error messages. A parser upgrade that changes
// their format must fail here rather than silently drop the caret.
describe('fhirpath.js parse errors', () => {
  function parseMessage(text: string): string {
    try {
      fhirpath.parse(text);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error(`${text} parsed`);
  }

  it('give a 1-based line, a 0-based UTF-16 column and the message', () => {
    // Line 2 is 7 UTF-16 code units long but 6 code points.
    expect(parseMessage("a +\n'😀' + ")).toMatch(
      /^line: 2; column: 7; message: mismatched input '<EOF>' expecting \{/,
    );
    expect(parseMessage('a.where(b')).toBe("line: 1; column: 9; message: missing ')' at '<EOF>'");
  });

  it('separate several errors with a newline, first error first', () => {
    expect(parseMessage('a = "x"').split('\n')).toEqual([
      "line: 1; column: 4; message: token recognition error at: '\"'",
      "line: 1; column: 6; message: token recognition error at: '\"'",
    ]);
  });

  it('count only \\n as a line break', () => {
    expect(parseMessage('a\r\nb c')).toMatch(/^line: 2; column: 0; /);
    expect(parseMessage('a\rb c')).toMatch(/^line: 1; column: 2; /);
  });
});
