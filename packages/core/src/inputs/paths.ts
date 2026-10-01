import path from 'node:path';

// A path as reports show it: relative to the working directory, with / separators. A path on
// another Windows drive cannot be relative, so it stays absolute.
export function displayPath(absolute: string, cwd: string): string {
  const relative = path.relative(cwd, absolute);
  const shown = path.isAbsolute(relative) ? absolute : relative === '' ? '.' : relative;
  return shown.split(path.sep).join('/');
}
