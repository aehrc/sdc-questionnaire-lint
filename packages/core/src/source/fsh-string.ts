// Decodes FSH string literals as SUSHI 3.20.1 does, so a decoded literal can be compared with the
// compiled JSON, and records where each decoded character came from in the literal.

// Where one decoded UTF-16 code unit came from: offsets into the literal, its opening quote
// included; the end is exclusive.
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface DecodedFshString {
  readonly value: string;
  // One span per UTF-16 code unit of value, in order.
  readonly spans: readonly SourceSpan[];
}

// SUSHI's replacement for \uXXXX. Its pattern also allows commas, and then JSON.parse throws.
function unescapeUnicode(_match: string, code: string): string {
  return JSON.parse(`"\\${code}"`) as string;
}

// SUSHI's FSHImporter.unescapeQuotedString: a "…" literal, quotes included, to its value. It
// splits on \\ first, so an escaped backslash never starts an escape. Throws where SUSHI throws.
function unescapeAsSushi(literal: string): string {
  return literal
    .slice(1, -1)
    .split(/\\\\/g)
    .map((piece) =>
      piece
        .replace(/\\(u[A-F,a-f,0-9]{4})/g, unescapeUnicode)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t'),
    )
    .join('\\');
}

const escapes: Readonly<Record<string, string>> = {
  '\\': '\\',
  '"': '"',
  n: '\n',
  r: '\r',
  t: '\t',
};

// One decoded character of a literal: a \u escape, another escape, or any single code unit.
const character = /\\u[0-9A-Fa-f]{4}|\\[\\"nrt]|[\s\S]/g;

function decodeCharacter(text: string): string {
  if (text.length === 1) return text;
  if (text.startsWith('\\u')) return String.fromCharCode(Number.parseInt(text.slice(2), 16));
  return escapes[text.charAt(1)] ?? text;
}

// Reads a "…" literal left to right, one character or escape at a time.
function scan(literal: string): DecodedFshString {
  const characters = [...literal.slice(1, -1).matchAll(character)];
  return {
    value: characters.map(([text]) => decodeCharacter(text)).join(''),
    spans: characters.map(({ 0: text, index }) => ({
      start: index + 1,
      end: index + 1 + text.length,
    })),
  };
}

// A "…" literal, quotes included, decoded with the source span of each code unit; or undefined
// when SUSHI cannot decode it, or decodes it differently from a left-to-right reading. The two
// differ only when a \u escape makes a backslash that SUSHI then reads as the start of the next
// escape; the source of such a character cannot be told, so the literal is left undecoded.
export function decodeFshString(literal: string): DecodedFshString | undefined {
  let value: string;
  try {
    value = unescapeAsSushi(literal);
  } catch {
    return undefined;
  }
  const scanned = scan(literal);
  return scanned.value === value ? scanned : undefined;
}

// SUSHI's FSHImporter.extractMultilineString: a """ literal, quotes included, to its value. It
// decodes neither \" nor \\. It drops a first and a last line that hold only whitespace, empties
// other such lines, and removes the indentation the remaining lines share. Throws where SUSHI
// throws.
function multilineAsSushi(literal: string): string {
  const lines = literal
    .slice(3, -3)
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\\(u[A-F,a-f,0-9]{4})/g, unescapeUnicode)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t'),
    );
  if (lines[0]?.search(/\S/) === -1) lines.shift();
  if (lines.at(-1)?.search(/\S/) === -1) lines.pop();
  const kept = lines.map((line) => (/^\s*$/.test(line) ? '' : line));
  const indents = kept.filter((line) => line !== '').map((line) => line.search(/\S/));
  const shared = indents.length === 0 ? 0 : Math.min(...indents);
  return kept.map((line) => line.slice(shared)).join('\n');
}

// A """ literal, quotes included, as SUSHI decodes it; or undefined when SUSHI cannot decode it.
export function decodeFshMultilineString(literal: string): string | undefined {
  try {
    return multilineAsSushi(literal);
  } catch {
    return undefined;
  }
}
