import path from 'node:path';
import type { RunPaths } from '../config/paths.js';
import { displayPath } from './paths.js';

// Where an entry came from; messages and failure help depend on it.
export type EntryOrigin = 'cli' | 'config' | 'default';

export interface InputEntry {
  origin: EntryOrigin;
  // Absolute path or glob pattern.
  absolute: string;
  // The directory the entry was resolved against; glob characters in it are literal.
  base: string;
  // The entry relative to the working directory, for messages.
  display: string;
}

export interface InputSelection {
  selection: 'targeted' | 'full';
  entries: InputEntry[];
}

// Exactly one list, by precedence: CLI paths, then config files, then the default directory.
// This is not a fallback: a list that fails to match never lets a later one run.
export function selectInputs({
  cwd,
  cliPaths,
  runPaths,
}: {
  cwd: string;
  cliPaths: readonly string[];
  runPaths: RunPaths;
}): InputSelection {
  const entry = (origin: EntryOrigin, absolute: string): InputEntry => ({
    origin,
    absolute,
    base: origin === 'cli' ? cwd : runPaths.base,
    display: displayPath(absolute, cwd),
  });
  if (cliPaths.length > 0) {
    return {
      selection: 'targeted',
      entries: cliPaths.map((cliPath) => entry('cli', path.resolve(cwd, cliPath))),
    };
  }
  if (runPaths.configFiles !== undefined) {
    return {
      selection: 'full',
      entries: runPaths.configFiles.map((file) => entry('config', file)),
    };
  }
  return { selection: 'full', entries: [entry('default', runPaths.defaultInputDirectory)] };
}
