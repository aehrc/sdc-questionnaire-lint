import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describeError, LintFailure } from '../failure.js';
import { displayPath } from '../inputs/paths.js';
import type { LintConfig } from './types.js';
import { type ConfigFormat, validateConfig } from './validate.js';

export interface LoadedConfig {
  // Absolute.
  path: string;
  // Config values resolve against it.
  dir: string;
  // Relative to the working directory, for reports and messages.
  display: string;
  format: ConfigFormat;
  config: LintConfig;
}

const configFileName = 'sdc-questionnaire-lint.config.json';
const moduleConfigFileName = 'sdc-questionnaire-lint.config.mjs';

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// The default config in the working directory, if exactly one exists.
async function discover(cwd: string): Promise<string | undefined> {
  const found: string[] = [];
  for (const name of [configFileName, moduleConfigFileName]) {
    if (await exists(path.join(cwd, name))) found.push(name);
  }
  if (found.length > 1) {
    throw new LintFailure({
      code: 'CONFIG_INVALID',
      message: `found both ${configFileName} and ${moduleConfigFileName} in the current directory`,
      help: 'choose one with --config, or remove the other file',
    });
  }
  return found[0];
}

// Imports the module, which runs its code and the plugins it imports.
async function importConfig(
  file: string,
  configFileFailure: (message: string, help: string) => LintFailure,
  display: string,
): Promise<unknown> {
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (error) {
    throw configFileFailure(
      `config ${display} failed to load: ${describeError(error)}`,
      'fix the error in the config module or in a plugin it imports',
    );
  }
  if (!('default' in module)) {
    throw configFileFailure(
      `config ${display} has no default export`,
      'export the config object: export default defineConfig({ … })',
    );
  }
  return module.default;
}

// The explicit config, or the one in the working directory; parent directories are not searched.
// An explicit config never falls back to discovery. Returns null when no config is used.
// An .mjs config runs code, so call this under the stdout guard.
export async function loadConfig({
  cwd,
  explicitPath,
}: {
  cwd: string;
  explicitPath?: string;
}): Promise<LoadedConfig | null> {
  const chosen = explicitPath ?? (await discover(cwd));
  if (chosen === undefined) return null;
  const file = path.resolve(cwd, chosen);
  const display = displayPath(file, cwd);
  const configFileFailure = (message: string, help: string): LintFailure =>
    new LintFailure({ code: 'CONFIG_INVALID', path: display, message, help });

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw configFileFailure(
        `config ${display} does not exist`,
        'check the path; it is relative to the current directory',
      );
    }
    if (code === 'EISDIR') {
      throw configFileFailure(
        `config ${display} is not a file`,
        `pass the path of the config file, such as ${configFileName}`,
      );
    }
    throw configFileFailure(
      `cannot read config ${display}: ${describeError(error)}`,
      'check the permissions of the config file',
    );
  }
  const loaded = (format: ConfigFormat, raw: unknown): LoadedConfig => ({
    path: file,
    dir: path.dirname(file),
    display,
    format,
    config: validateConfig(raw, { display, format }),
  });
  // Checked after reading, so a mistyped path is reported as missing.
  const extension = path.extname(file);
  if (extension === '.mjs') {
    return loaded('mjs', await importConfig(file, configFileFailure, display));
  }
  if (extension !== '.json') {
    throw configFileFailure(
      `config ${display} is neither a .json nor an .mjs file`,
      `use ${configFileName}, or ${moduleConfigFileName} to list plugins`,
    );
  }
  let raw: unknown;
  try {
    // Tolerate a byte order mark, which JSON.parse rejects.
    raw = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (error) {
    throw configFileFailure(
      `config ${display} is not valid JSON: ${describeError(error)}`,
      'fix the JSON syntax at the position the message gives',
    );
  }
  return loaded('json', raw);
}
