import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describeError, LintFailure } from '../failure.js';
import { displayPath } from '../inputs/paths.js';
import type { LintConfig } from './types.js';
import { validateConfig } from './validate.js';

export interface LoadedConfig {
  // Absolute.
  path: string;
  // Config values resolve against it.
  dir: string;
  // Relative to the working directory, for reports and messages.
  display: string;
  config: LintConfig;
}

const configFileName = 'sdc-questionnaire-lint.config.json';

// The explicit config, or the one in the working directory; parent directories are not searched.
// An explicit config never falls back to discovery. Returns null when no config is used.
export async function loadConfig({
  cwd,
  explicitPath,
}: {
  cwd: string;
  explicitPath?: string;
}): Promise<LoadedConfig | null> {
  const file = path.resolve(cwd, explicitPath ?? configFileName);
  const display = displayPath(file, cwd);
  const invalid = (message: string, help: string): LintFailure =>
    new LintFailure({ code: 'CONFIG_INVALID', path: display, message, help });

  if (path.extname(file) !== '.json') {
    throw invalid(
      `config ${display} is not a JSON file`,
      `use a JSON config, such as ${configFileName}`,
    );
  }
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      if (explicitPath === undefined) return null;
      throw invalid(
        `config ${display} does not exist`,
        'check the path; it is relative to the current directory',
      );
    }
    if (code === 'EISDIR') {
      throw invalid(
        `config ${display} is not a file`,
        `pass the path of the config file, such as ${configFileName}`,
      );
    }
    throw invalid(
      `cannot read config ${display}: ${describeError(error)}`,
      'check the permissions of the config file',
    );
  }
  let raw: unknown;
  try {
    // Tolerate a byte order mark, which JSON.parse rejects.
    raw = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (error) {
    throw invalid(
      `config ${display} is not valid JSON: ${describeError(error)}`,
      'fix the JSON syntax at the position the message gives',
    );
  }
  return { path: file, dir: path.dirname(file), display, config: validateConfig(raw, display) };
}
