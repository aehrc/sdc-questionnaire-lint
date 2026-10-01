import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describeError, LintFailure } from '../failure.js';
import { parseJson } from '../json.js';
import type { SelectedConfig } from './discover.js';
import type { LintConfig } from './types.js';
import { type ConfigFormat, validateConfig } from './validate.js';

export interface LoadedConfig extends SelectedConfig {
  format: ConfigFormat;
  config: LintConfig;
}

function invalid(selected: SelectedConfig, message: string, help: string): LintFailure {
  return new LintFailure({ code: 'CONFIG_INVALID', path: selected.display, message, help });
}

async function readJsonConfig(selected: SelectedConfig): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(selected.path, 'utf8');
  } catch (error) {
    throw invalid(
      selected,
      `cannot read config ${selected.display}: ${describeError(error)}`,
      'check the permissions of the config file',
    );
  }
  try {
    // Tolerate a byte order mark, which JSON.parse rejects.
    return parseJson(text.startsWith('\uFEFF') ? text.slice(1) : text);
  } catch (error) {
    throw invalid(
      selected,
      `config ${selected.display} is not valid JSON: ${describeError(error)}`,
      'fix the JSON syntax at that position',
    );
  }
}

// Imports the module, which runs its code and any plugin imports. Run it under the stdout guard.
async function importModuleConfig(selected: SelectedConfig): Promise<unknown> {
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(selected.path).href)) as Record<string, unknown>;
  } catch (error) {
    throw invalid(
      selected,
      `config ${selected.display} failed to load: ${describeError(error)}`,
      'fix the error in the config module or in a plugin it imports',
    );
  }
  if (!('default' in module)) {
    throw invalid(
      selected,
      `config ${selected.display} has no default export`,
      'export the config object: export default defineConfig({ … })',
    );
  }
  return module.default;
}

export async function loadConfig(selected: SelectedConfig): Promise<LoadedConfig> {
  const extension = path.extname(selected.path);
  let format: ConfigFormat;
  let raw: unknown;
  if (extension === '.json') {
    format = 'json';
    raw = await readJsonConfig(selected);
  } else if (extension === '.mjs') {
    format = 'mjs';
    raw = await importModuleConfig(selected);
  } else {
    throw invalid(
      selected,
      `config ${selected.display} is neither a .json nor an .mjs file`,
      'use a .json config, or an .mjs config to load plugins',
    );
  }
  return {
    ...selected,
    format,
    config: validateConfig(raw, { display: selected.display, format }),
  };
}
