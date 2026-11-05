/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { stat } from 'node:fs/promises';
import { compareStrings } from '../compare.js';
import type { RunPaths } from '../config/paths.js';
import { displayPath } from '../inputs/paths.js';

export interface FshSources {
  // Existing directories, absolute, for the source map.
  directories: string[];
  // The same directories as the summary shows them: display paths, sorted and deduplicated.
  fshSources: string[];
  fshSourceLookup: 'enabled' | 'omitted';
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    // Missing or unreadable FSH directories only mean less source mapping, never a failure.
    return false;
  }
}

export async function findFshSources(runPaths: RunPaths, cwd: string): Promise<FshSources> {
  const byDisplay = new Map<string, string>();
  for (const directory of runPaths.fshDirectories) {
    if (await isDirectory(directory)) byDisplay.set(displayPath(directory, cwd), directory);
  }
  const fshSources = [...byDisplay.keys()].sort(compareStrings);
  return {
    directories: fshSources.map((display) => byDisplay.get(display) ?? display),
    fshSources,
    fshSourceLookup: runPaths.fshSourceLookup,
  };
}
