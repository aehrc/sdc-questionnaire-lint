import fhirpath from 'fhirpath';
import type { ExpressionSite } from '../plugins/types.js';

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

// Parses text with the pinned fhirpath.js; returns undefined when it parses. The only use of
// fhirpath.js in the linter.
export function checkFhirPathSyntax(text: string): FhirPathSyntaxError | undefined {
  try {
    fhirpath.parse(text);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const match = errorLine.exec(message);
    // Some invalid input, such as a.b..c, makes the parser itself throw without a position.
    if (match?.index !== 0) return {};
    const [, line = '', column = '', parserMessage = ''] = match;
    const offset = toOffset(text, Number(line), Number(column));
    return { parserMessage, ...(offset === undefined ? {} : { offset }) };
  }
}
