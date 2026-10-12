import { parseArgs } from 'node:util';
import type { OutputFormat } from '../failure.js';

export type Command = 'lint' | 'explain';
export type Format = OutputFormat;

const formats: readonly Format[] = ['text', 'json', 'github', 'sarif'];

function isFormat(value: string): value is Format {
  return (formats as readonly string[]).includes(value);
}

export type ParsedArgs =
  | { kind: 'help'; command?: Command }
  | { kind: 'version' }
  | { kind: 'lint'; paths: string[]; configPath?: string; format: Format; showInfo: boolean }
  | { kind: 'explain'; ruleId?: string; configPath?: string }
  // failureFormat: the one valid lint --format selection, whose failure document stdout still gets.
  | { kind: 'usage-error'; message: string; help: string; failureFormat?: Format }
  | { kind: 'no-command' };

interface Flag {
  name: string;
  rawName: string;
  value: string | undefined;
}

const valueFlags = new Set(['config', 'format']);
const booleanFlags = new Set(['help', 'version', 'show-info']);
const lintOnlyFlags = new Set(['format', 'show-info']);

function isCommand(value: string): value is Command {
  return value === 'lint' || value === 'explain';
}

function helpFor(command: Command | undefined): string {
  return command === undefined
    ? 'run sdc-lint --help for the available commands and flags'
    : `run sdc-lint ${command} --help for the available flags`;
}

// parseArgs only tokenizes here. Its strict mode stops at the first bad argument, but --help and
// --version must win over later errors, and a json, github or sarif format selection must survive
// them (T05).
function tokenize(argv: readonly string[]): {
  flags: Flag[];
  positionals: string[];
  command?: string;
} {
  const { tokens } = parseArgs({
    args: [...argv],
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const flags: Flag[] = [];
  const positionals: string[] = [];
  let command: string | undefined;
  let afterTerminator = false;
  let consumed = -1;

  for (const [i, token] of tokens.entries()) {
    if (i === consumed) continue;
    if (token.kind === 'option-terminator') {
      afterTerminator = true;
    } else if (token.kind === 'positional') {
      if (command === undefined && !afterTerminator) command = token.value;
      else positionals.push(token.value);
    } else {
      // A value flag takes the next argument only when it is a plain word, as strict parseArgs does.
      const next = tokens[i + 1];
      if (
        valueFlags.has(token.name) &&
        token.value === undefined &&
        next?.kind === 'positional' &&
        next.index === token.index + 1
      ) {
        flags.push({ name: token.name, rawName: token.rawName, value: next.value });
        consumed = i + 1;
      } else {
        flags.push({ name: token.name, rawName: token.rawName, value: token.value });
      }
    }
  }
  return command === undefined ? { flags, positionals } : { flags, positionals, command };
}

function findError(
  command: Command | undefined,
  flags: readonly Flag[],
  positionals: readonly string[],
): string | undefined {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!valueFlags.has(flag.name) && !booleanFlags.has(flag.name)) {
      return `unknown flag ${flag.rawName}`;
    }
    if (booleanFlags.has(flag.name) && flag.value !== undefined) {
      return `${flag.rawName} does not take a value`;
    }
    if (valueFlags.has(flag.name)) {
      const { value } = flag;
      if (!value) return `${flag.rawName} requires a value`;
      if (seen.has(flag.name)) return `${flag.rawName} was given more than once`;
      seen.add(flag.name);
      if (flag.name === 'format' && !isFormat(value)) {
        return `--format must be text, json, github or sarif, not ${value}`;
      }
    }
    if (command === 'explain' && lintOnlyFlags.has(flag.name)) {
      return `${flag.rawName} is not available for explain`;
    }
  }
  const [first] = positionals;
  if (command === undefined && first !== undefined) {
    return `unexpected argument ${first}; name a command first`;
  }
  if (command === 'explain' && positionals.length > 1) {
    return `explain takes at most one rule ID, got ${String(positionals.length)}`;
  }
  return undefined;
}

// findError has checked the value, so anything else is the default.
function formatOf(value: string | undefined): Format {
  return value !== undefined && isFormat(value) ? value : 'text';
}

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const { flags, positionals, command: word } = tokenize(argv);
  const has = (name: string): boolean => flags.some((flag) => flag.name === name);
  const valueOf = (name: string): string | undefined =>
    flags.find((flag) => flag.name === name)?.value;

  if (word !== undefined && !isCommand(word)) {
    return {
      kind: 'usage-error',
      message: `unknown command ${word}`,
      help: helpFor(undefined),
    };
  }
  const command: Command | undefined = word;
  if (has('help')) return command === undefined ? { kind: 'help' } : { kind: 'help', command };
  if (has('version')) return { kind: 'version' };

  const message = findError(command, flags, positionals);
  if (message !== undefined) {
    const selected = flags.filter((flag) => flag.name === 'format');
    const value = selected.length === 1 ? selected[0]?.value : undefined;
    const failureFormat =
      command === 'lint' && value !== undefined && isFormat(value) ? value : undefined;
    return {
      kind: 'usage-error',
      message,
      help: helpFor(command),
      ...(failureFormat === undefined ? {} : { failureFormat }),
    };
  }

  const configPath = valueOf('config');
  const config = configPath === undefined ? {} : { configPath };
  switch (command) {
    case undefined:
      return { kind: 'no-command' };
    case 'lint':
      return {
        kind: 'lint',
        paths: positionals,
        ...config,
        format: formatOf(valueOf('format')),
        showInfo: has('show-info'),
      };
    case 'explain': {
      const ruleId = positionals[0];
      return { kind: 'explain', ...(ruleId === undefined ? {} : { ruleId }), ...config };
    }
  }
}
