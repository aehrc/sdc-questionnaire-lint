/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isObject } from '../object.js';
import { canonical } from './fsh-files.js';

// The SUSHI index, fsh-generated/data/fsh-index.json: for each file SUSHI wrote, the definition
// that produced it. Inline instances are never listed. A missing or malformed index is read as an
// empty one, so lookup falls back to searching the FSH directories.

export interface SushiIndexEntry {
  // Canonical absolute path of the output file, in fsh-generated/resources beside the index's
  // data directory.
  readonly outputPath: string;
  readonly fshName: string;
  // As written: relative to SUSHI's input directory, normally input/fsh.
  readonly fshFile: string;
  readonly startLine: number;
}

export async function readSushiIndex(indexPath: string): Promise<SushiIndexEntry[]> {
  const json: unknown = await readFile(indexPath, 'utf8')
    .then((text) => JSON.parse(text) as unknown)
    .catch(() => undefined);
  if (!Array.isArray(json)) return [];
  const resources = await canonical(path.join(path.dirname(indexPath), '..', 'resources'));
  if (resources === undefined) return [];
  return json.flatMap((entry): SushiIndexEntry[] => {
    if (!isObject(entry)) return [];
    const { outputFile, fshName, fshType, fshFile, startLine } = entry;
    if (
      fshType !== 'Instance' ||
      typeof outputFile !== 'string' ||
      typeof fshName !== 'string' ||
      typeof fshFile !== 'string' ||
      !Number.isInteger(startLine)
    ) {
      return [];
    }
    return [
      {
        outputPath: path.join(resources, outputFile),
        fshName,
        fshFile,
        startLine: startLine as number,
      },
    ];
  });
}
