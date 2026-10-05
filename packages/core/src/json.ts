// JSON.parse with a usable error: V8's message may omit the position and quote the whole input.
export class JsonSyntaxError extends Error {
  override readonly name = 'JsonSyntaxError';

  // One-based; columns count UTF-16 code units.
  constructor(
    readonly problem: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${problem} at line ${String(line)}, column ${String(column)}`);
  }
}

const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const escapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);

class Failure extends Error {
  constructor(
    readonly offset: number,
    readonly problem: string,
  ) {
    super(problem);
  }
}

// Finds the first syntax error in text that JSON.parse rejected. Only used after a failure.
function locateError(text: string): Failure {
  let i = 0;
  const fail = (problem?: string): never => {
    const found = text[i];
    throw new Failure(
      i,
      problem ??
        (found === undefined ? 'unexpected end of file' : `unexpected ${JSON.stringify(found)}`),
    );
  };
  const skipWhitespace = (): void => {
    while (i < text.length && ' \t\n\r'.includes(text[i] ?? '')) i++;
  };
  const expect = (char: string): void => {
    skipWhitespace();
    if (text[i] !== char) fail();
    i++;
  };
  const string = (): void => {
    expect('"');
    for (;;) {
      const char = text[i];
      if (char === undefined) fail('unterminated string');
      else if (char === '"') break;
      else if (char === '\\') {
        const next = text[i + 1] ?? '';
        if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) i += 6;
        else if (escapes.has(next)) i += 2;
        else fail('invalid escape in string');
      } else if (char < ' ') fail('control character in string');
      else i++;
    }
    i++;
  };
  const value = (): void => {
    skipWhitespace();
    const char = text[i];
    if (char === '{') {
      i++;
      skipWhitespace();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        string();
        expect(':');
        value();
        skipWhitespace();
        if (text[i] === '}') break;
        expect(',');
      }
      i++;
    } else if (char === '[') {
      i++;
      skipWhitespace();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        skipWhitespace();
        if (text[i] === ']') break;
        expect(',');
      }
      i++;
    } else if (char === '"') {
      string();
    } else {
      for (const literal of ['true', 'false', 'null']) {
        if (text.startsWith(literal, i)) {
          i += literal.length;
          return;
        }
      }
      numberPattern.lastIndex = i;
      if (!numberPattern.test(text)) fail();
      i = numberPattern.lastIndex;
    }
  };

  try {
    value();
    skipWhitespace();
    if (i < text.length) fail();
  } catch (error) {
    if (error instanceof Failure) return error;
    throw error;
  }
  // JSON.parse rejected text this scanner accepts; should not happen, so point at the start.
  return new Failure(0, 'invalid JSON');
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const { offset, problem } = locateError(text);
    const before = text.slice(0, offset);
    const line = before.split('\n').length;
    const column = offset - before.lastIndexOf('\n');
    throw new JsonSyntaxError(problem, line, column);
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
