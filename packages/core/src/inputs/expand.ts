import * as nodeFs from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { glob, isDynamicPattern } from 'tinyglobby';
import { describeError, LintFailure } from '../failure.js';
import type { InputEntry } from './select.js';

const ignore = ['**/.git/**', '**/node_modules/**'];

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isMissing(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function unreadable(display: string, error: unknown): LintFailure {
  return new LintFailure({
    code: 'INPUT_UNREADABLE',
    path: display,
    message: `cannot read input ${display}: ${describeError(error)}`,
    help: 'check the permissions of the input and the directories above it',
  });
}

function relativeHelp(entry: InputEntry): string {
  return entry.origin === 'config'
    ? 'check files in the config; its paths are relative to the config directory'
    : 'check the path; it is relative to the current directory';
}

// Splits an entry into the directory it names before anything the user wrote, and the rest. Only
// the rest can hold a glob, so a working directory named "My (copy)" stays literal.
function typedPart(entry: InputEntry): { fixed: string; typed: string } {
  const relative = path.relative(entry.base, entry.absolute);
  // On another Windows drive nothing is relative to the base.
  if (path.isAbsolute(relative)) {
    const { root } = path.parse(entry.absolute);
    return { fixed: root, typed: entry.absolute.slice(root.length).replaceAll('\\', '/') };
  }
  const segments = relative === '' ? [] : relative.split(path.sep);
  let up = 0;
  while (segments[up] === '..') up++;
  return {
    fixed: path.resolve(entry.base, ...segments.slice(0, up)),
    typed: segments.slice(up).join('/'),
  };
}

// Splits a typed pattern into the static directory to crawl and the glob below it.
function splitPattern(fixed: string, typed: string): { base: string; pattern: string } {
  const segments = typed.split('/');
  const found = segments.findIndex((segment) => isDynamicPattern(segment));
  const dynamic = found === -1 ? segments.length - 1 : found;
  const base = path.join(fixed, ...segments.slice(0, dynamic));
  const pattern = segments.slice(dynamic).join('/');
  // A leading ! would negate the pattern; negation is outside the contract.
  return { base, pattern: pattern.startsWith('!') ? `\\${pattern}` : pattern };
}

// Files below base matching pattern, skipping .git, node_modules and every symlink. tinyglobby's
// crawler hides directory errors, so a wrapped readdir records them.
async function crawl(base: string, pattern: string, display: string): Promise<string[]> {
  const errors: { directory: string; error: NodeJS.ErrnoException }[] = [];
  const readdir = ((
    directory: string,
    options: unknown,
    callback: (...args: unknown[]) => void,
  ) => {
    nodeFs.readdir(directory, options as { withFileTypes: true }, (error, entries) => {
      if (error) errors.push({ directory, error });
      callback(error, entries);
    });
  }) as typeof nodeFs.readdir;
  const files = await glob(pattern, {
    cwd: base,
    absolute: true,
    onlyFiles: true,
    dot: true,
    ignore,
    expandDirectories: false,
    followSymbolicLinks: false,
    braceExpansion: false,
    extglob: false,
    fs: { readdir },
  });
  // A base that does not exist simply matches nothing.
  const failed = errors.find(({ error }) => !isMissing(error));
  if (failed) throw unreadable(display, failed.error);
  return files.map((file) => path.normalize(file));
}

async function expandEntry(entry: InputEntry): Promise<string[]> {
  let kind: 'file' | 'directory' | 'other' | 'missing';
  try {
    const stats = await stat(entry.absolute);
    kind = stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if (!isMissing(error)) throw unreadable(entry.display, error);
    kind = 'missing';
  }

  // An existing path is literal, even inside .git or node_modules, and even with glob characters.
  if (kind === 'file') return [entry.absolute];
  if (kind === 'other') {
    throw unreadable(entry.display, new Error('not a file or directory'));
  }
  // The default directory may be missing or empty; the no-Questionnaires failure explains that.
  if (entry.origin === 'default') {
    return kind === 'directory' ? crawl(entry.absolute, '**/*.json', entry.display) : [];
  }
  if (kind === 'directory') {
    const files = await crawl(entry.absolute, '**/*.json', entry.display);
    if (files.length === 0) {
      throw new LintFailure({
        code: 'INPUT_PATTERN_UNMATCHED',
        path: entry.display,
        message: `directory ${entry.display} contains no .json files`,
        help: 'check the directory, or pass the JSON files themselves',
      });
    }
    return files;
  }
  const { fixed, typed } = typedPart(entry);
  if (isDynamicPattern(typed)) {
    const { base, pattern } = splitPattern(fixed, typed);
    const files = await crawl(base, pattern, entry.display);
    if (files.length === 0) {
      throw new LintFailure({
        code: 'INPUT_PATTERN_UNMATCHED',
        path: entry.display,
        message: `pattern ${entry.display} matched no files`,
        help: `${relativeHelp(entry)}; quote globs so the linter expands them`,
      });
    }
    return files;
  }
  throw new LintFailure({
    code: 'INPUT_NOT_FOUND',
    path: entry.display,
    message: `input ${entry.display} does not exist`,
    help: relativeHelp(entry),
  });
}

// Absolute paths of every selected file, in entry order. One failing entry fails the run.
export async function expandEntries(entries: readonly InputEntry[]): Promise<string[]> {
  const files: string[] = [];
  for (const entry of entries) files.push(...(await expandEntry(entry)));
  return files;
}
