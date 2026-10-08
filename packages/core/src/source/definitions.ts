import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ResourceIdentity } from '../report/types.js';
import type { FshDefinition } from './fsh-document.js';
import type { FshFile, FshFiles } from './fsh-files.js';
import { resolvePaths } from './fsh-paths.js';
import { decodeFshString } from './fsh-string.js';
import type { SushiIndexEntry } from './sushi-index.js';

// Finds the FSH Instance that produced a resource: through the SUSHI index when it has a usable
// entry for the resource's file, otherwise by searching the FSH directories for the one Instance
// with the resource's id and type.

export interface FoundDefinition {
  readonly file: FshFile;
  readonly definition: FshDefinition;
}

export type DefinitionLookup = FoundDefinition | { readonly reason: 'not-found' };

export interface LookupTarget {
  // The resource a finding is in: the input file's root, a Bundle entry or a contained resource.
  readonly resource: ResourceIdentity;
  // Canonical absolute path of the input file.
  readonly inputPath: string;
}

function isInside(file: string, directory: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== '' && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..';
}

// The files an index entry may name: fshFile in each FSH directory that holds it inside. fshFile
// is relative to SUSHI's input directory, which may be any of them.
async function indexedFiles(fshFile: string, fsh: FshFiles): Promise<FshFile[]> {
  if (path.isAbsolute(fshFile)) return [];
  const files: FshFile[] = [];
  for (const directory of await fsh.directories()) {
    let file: string;
    try {
      file = await realpath(path.resolve(directory, fshFile));
    } catch {
      continue;
    }
    const read = isInside(file, directory) ? await fsh.file(file) : undefined;
    if (read !== undefined) files.push(read);
  }
  return files;
}

// The definition the index names for the file at the root of the input, when the entry is
// current: one of its files holds an Instance with its name starting on its line.
async function fromIndex(
  target: LookupTarget,
  index: readonly SushiIndexEntry[],
  fsh: FshFiles,
): Promise<FoundDefinition | undefined> {
  if (target.resource.pointer !== '') return undefined;
  const entry = index.find(({ outputPath }) => outputPath === target.inputPath);
  if (entry === undefined) return undefined;
  for (const file of await indexedFiles(entry.fshFile, fsh)) {
    const definition = file.document.definitions.find(
      ({ keyword, name, startLine }) =>
        keyword === 'Instance' && name === entry.fshName && startLine === entry.startLine,
    );
    if (definition !== undefined) return { file, definition };
  }
  return undefined;
}

// The id SUSHI gives an Instance: its last id rule's string, otherwise its name.
function effectiveId(definition: FshDefinition): string {
  let id = definition.name;
  for (const { rule, path: rulePath } of resolvePaths(definition)) {
    if (rulePath !== 'id' || rule.kind !== 'assignment' || rule.value.kind !== 'string') continue;
    id = decodeFshString(rule.value.literal)?.value ?? id;
  }
  return id;
}

// What a search looks through: the Instances by id, and the Profiles.
interface SearchIndex {
  readonly instances: ReadonlyMap<string, readonly FoundDefinition[]>;
  readonly profiles: readonly FshDefinition[];
}

// Worked out once per run: keyed by the run's list of every FSH file, which FshFiles caches.
const searchIndexes = new WeakMap<readonly FshFile[], SearchIndex>();

function searchIndex(files: readonly FshFile[]): SearchIndex {
  let built = searchIndexes.get(files);
  if (built !== undefined) return built;
  const instances = new Map<string, FoundDefinition[]>();
  const profiles: FshDefinition[] = [];
  for (const file of files) {
    for (const definition of file.document.definitions) {
      if (definition.keyword === 'Profile') profiles.push(definition);
      if (definition.keyword !== 'Instance') continue;
      const id = effectiveId(definition);
      const found = instances.get(id);
      if (found === undefined) instances.set(id, [{ file, definition }]);
      else found.push({ file, definition });
    }
  }
  built = { instances, profiles };
  searchIndexes.set(files, built);
  return built;
}

// Whether an InstanceOf names the resource type: the type itself, or a Profile in the FSH
// directories, by name or Id, whose Parent chain reaches it. A profile defined elsewhere, such as
// in a package, does not match.
function instanceOfMatches(
  instanceOf: string | undefined,
  resourceType: string,
  profiles: readonly FshDefinition[],
): boolean {
  const seen = new Set<string>();
  let current = instanceOf;
  while (current !== undefined && !seen.has(current)) {
    if (current === resourceType) return true;
    seen.add(current);
    const named = current;
    const profile = profiles.find(
      ({ name, metadata }) => name === named || metadata.get('Id') === named,
    );
    current = profile?.metadata.get('Parent');
  }
  return false;
}

// The one Instance in the FSH directories with the resource's id and type.
async function bySearch(
  { resourceType, id }: ResourceIdentity,
  fsh: FshFiles,
): Promise<FoundDefinition | undefined> {
  if (id === undefined) return undefined;
  const { instances, profiles } = searchIndex(await fsh.all());
  const matches = (instances.get(id) ?? []).filter(({ definition }) =>
    instanceOfMatches(definition.metadata.get('InstanceOf'), resourceType, profiles),
  );
  const [only] = matches;
  return matches.length === 1 ? only : undefined;
}

export async function findDefinition(
  target: LookupTarget,
  index: readonly SushiIndexEntry[],
  fsh: FshFiles,
): Promise<DefinitionLookup> {
  return (
    (await fromIndex(target, index, fsh)) ??
    (await bySearch(target.resource, fsh)) ?? { reason: 'not-found' }
  );
}
