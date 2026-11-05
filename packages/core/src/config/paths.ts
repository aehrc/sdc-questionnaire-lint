/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import path from 'node:path';

interface PathsConfig {
  dir: string;
  config: { files?: string[]; source?: { fsh?: string[] } };
}

export const defaultInputDirectory = 'fsh-generated/resources';
export const defaultFshDirectories = ['input/fsh'];
export const defaultSushiIndex = 'fsh-generated/data/fsh-index.json';

// Absolute paths for everything the config or the defaults name (cli.md § Configuration and path
// bases). CLI input paths are not resolved here: they are always relative to the working directory.
export interface RunPaths {
  // The directory config values and defaults resolve against: the config's, or the working one.
  base: string;
  // Config files entries, resolved against the config directory. Patterns keep their glob syntax.
  configFiles?: string[];
  // Directories to search for FSH, before checking which exist.
  fshDirectories: string[];
  fshSourceLookup: 'enabled' | 'omitted';
  defaultInputDirectory: string;
  sushiIndex: string;
}

// Config values resolve against the config's directory; defaults do too, or against the working
// directory when no config is used.
export function resolveRunPaths({
  cwd,
  config,
}: {
  cwd: string;
  config: PathsConfig | null;
}): RunPaths {
  const base = config?.dir ?? cwd;
  const values = config?.config ?? {};
  const fsh = values.source?.fsh ?? defaultFshDirectories;
  const resolve = (value: string): string => path.resolve(base, value);
  return {
    base,
    ...(values.files === undefined ? {} : { configFiles: values.files.map(resolve) }),
    fshDirectories: fsh.map(resolve),
    fshSourceLookup: fsh.length === 0 ? 'omitted' : 'enabled',
    defaultInputDirectory: resolve(defaultInputDirectory),
    sushiIndex: resolve(defaultSushiIndex),
  };
}
