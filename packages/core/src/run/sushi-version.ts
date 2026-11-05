/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isObject } from '../object.js';

const missing = Symbol('missing');

// The parsed package.json; missing when there is none, so the search goes on; undefined when it
// cannot be read or parsed.
async function readManifest(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? missing : undefined;
  }
}

function sushiVersion(manifest: unknown): string | undefined {
  if (!isObject(manifest) || manifest.name !== 'fsh-sushi') return undefined;
  const { version } = manifest;
  return typeof version === 'string' && version !== '' ? version : undefined;
}

// The version of the fsh-sushi package installed for the IG, found as Node finds a package: in
// node_modules in the run's base, then in each directory above it. That is the SUSHI that npm run
// scripts and ./node_modules/.bin/sushi run. NODE_PATH and global installs are not searched: a
// SUSHI the IG does not install need not be the one that ran. Undefined when none is installed,
// or the first one found has an unreadable package.json or no version; the report then leaves the
// version out rather than guess.
export async function findSushiVersion(base: string): Promise<string | undefined> {
  for (let directory = path.resolve(base); ; directory = path.dirname(directory)) {
    // Node does not look in node_modules/node_modules.
    if (path.basename(directory) !== 'node_modules') {
      const manifest = await readManifest(
        path.join(directory, 'node_modules', 'fsh-sushi', 'package.json'),
      );
      if (manifest !== missing) return sushiVersion(manifest);
    }
    if (path.dirname(directory) === directory) return undefined;
  }
}
