import { readFile, realpath } from 'node:fs/promises';
import { glob } from 'tinyglobby';
import { getOrSet } from '../cache.js';
import { compareStrings } from '../compare.js';
import { parseFshDocument, type FshDocument } from './fsh-document.js';

// The FSH files of one run, each read and parsed at most once, and only when needed. A file or
// directory that cannot be read, or a file that cannot be parsed, only means less source mapping:
// it is left out, never a failure.

export interface FshFile {
  // Canonical absolute path.
  readonly path: string;
  readonly document: FshDocument;
}

export interface FshFiles {
  // The canonical FSH directories that exist; empty when lookup is omitted or none exist.
  directories(): Promise<readonly string[]>;
  // The file at a canonical path, or undefined when it cannot be read or parsed.
  file(path: string): Promise<FshFile | undefined>;
  // Every .fsh file below the directories, by path, skipping .git, node_modules and symlinks.
  all(): Promise<readonly FshFile[]>;
  // The aliases of every file, by name; a later file's alias replaces an earlier one's.
  aliases(): Promise<ReadonlyMap<string, string>>;
}

// The canonical path, or undefined when it cannot be resolved.
export async function canonical(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

async function listFsh(directory: string): Promise<string[]> {
  try {
    return await glob('**/*.fsh', {
      cwd: directory,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/.git/**', '**/node_modules/**'],
      followSymbolicLinks: false,
      expandDirectories: false,
    });
  } catch {
    return [];
  }
}

// directories: absolute paths of the existing FSH directories (run/sources.ts).
export function fshFiles(directories: readonly string[]): FshFiles {
  const files = new Map<string, Promise<FshFile | undefined>>();
  let canonicalDirectories: Promise<string[]> | undefined;
  let everyFile: Promise<FshFile[]> | undefined;
  let everyAlias: Promise<Map<string, string>> | undefined;

  // A file that cannot be parsed is left out too.
  const file = (path: string): Promise<FshFile | undefined> =>
    getOrSet(files, path, () =>
      readFile(path, 'utf8')
        .then((text) => ({ path, document: parseFshDocument(text) }))
        .catch(() => undefined),
    );

  function canonicalDirectoriesOnce(): Promise<string[]> {
    canonicalDirectories ??= Promise.all(directories.map(canonical)).then((found) => [
      ...new Set(found.filter((directory) => directory !== undefined)),
    ]);
    return canonicalDirectories;
  }

  async function readAll(): Promise<FshFile[]> {
    const listed = await Promise.all((await canonicalDirectoriesOnce()).map(listFsh));
    const paths = [...new Set(listed.flat())].sort(compareStrings);
    const read = await Promise.all(paths.map(file));
    return read.filter((each) => each !== undefined);
  }

  const all = (): Promise<FshFile[]> => (everyFile ??= readAll());

  return {
    directories: canonicalDirectoriesOnce,
    file,
    all,
    aliases: () =>
      (everyAlias ??= all().then(
        (read) => new Map(read.flatMap(({ document }) => [...document.aliases])),
      )),
  };
}
