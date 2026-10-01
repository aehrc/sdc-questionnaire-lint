import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { describeError, LintFailure } from '../failure.js';

// A path as reports show it: relative to the working directory, with / separators. Pass canonical
// paths for both, so a symlinked root (macOS /tmp) still gives relative paths. A path on another
// Windows drive cannot be relative, so it stays absolute.
export function displayPath(absolute: string, cwd: string): string {
  const relative = path.relative(cwd, absolute);
  const shown = path.isAbsolute(relative) ? absolute : relative === '' ? '.' : relative;
  return shown.split(path.sep).join('/');
}

export interface InputFile {
  // Canonical absolute path: the file's identity.
  path: string;
  display: string;
}

// Resolves symlinks so each file is read once, however many entries selected it. Sorted by display
// path, by code unit.
export async function canonicalFiles(
  files: readonly string[],
  canonicalCwd: string,
): Promise<InputFile[]> {
  const byPath = new Map<string, InputFile>();
  for (const file of files) {
    let canonical: string;
    try {
      canonical = await realpath(file);
    } catch (error) {
      const display = displayPath(file, canonicalCwd);
      throw new LintFailure({
        code: 'INPUT_UNREADABLE',
        path: display,
        message: `cannot read input ${display}: ${describeError(error)}`,
        help: 'check the permissions of the input and the directories above it',
      });
    }
    if (!byPath.has(canonical)) {
      byPath.set(canonical, { path: canonical, display: displayPath(canonical, canonicalCwd) });
    }
  }
  return [...byPath.values()].sort((a, b) =>
    a.display < b.display ? -1 : a.display > b.display ? 1 : 0,
  );
}
