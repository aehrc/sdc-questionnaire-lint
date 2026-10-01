import { stat } from 'node:fs/promises';
import path from 'node:path';
import { describeError, LintFailure } from '../failure.js';
import { displayPath } from '../inputs/paths.js';

export const configFileNames = [
  'sdc-questionnaire-lint.config.json',
  'sdc-questionnaire-lint.config.mjs',
] as const;

export interface SelectedConfig {
  // Absolute path of the config file, and the directory its relative paths resolve against.
  path: string;
  dir: string;
  // The path as reports and messages show it.
  display: string;
}

function selected(file: string, cwd: string): SelectedConfig {
  return { path: file, dir: path.dirname(file), display: displayPath(file, cwd) };
}

async function fileKind(file: string, display: string): Promise<'file' | 'missing' | 'other'> {
  try {
    return (await stat(file)).isFile() ? 'file' : 'other';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
    throw new LintFailure({
      code: 'CONFIG_INVALID',
      path: display,
      message: `cannot read config ${display}: ${describeError(error)}`,
      help: 'check the permissions of the config file and its directory',
    });
  }
}

// --config wins and never falls back to discovery. Without it, look in the working directory only.
export async function selectConfig({
  cwd,
  explicitPath,
}: {
  cwd: string;
  explicitPath?: string;
}): Promise<SelectedConfig | null> {
  if (explicitPath !== undefined) {
    const file = path.resolve(cwd, explicitPath);
    const display = displayPath(file, cwd);
    const kind = await fileKind(file, display);
    if (kind === 'missing') {
      throw new LintFailure({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config file ${display} does not exist`,
        help: 'check the --config path; it is relative to the current directory',
      });
    }
    if (kind === 'other') {
      throw new LintFailure({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config path ${display} is not a file`,
        help: 'pass the path of a .json or .mjs config file to --config',
      });
    }
    return selected(file, cwd);
  }

  const found: string[] = [];
  for (const name of configFileNames) {
    const file = path.join(cwd, name);
    if ((await fileKind(file, name)) === 'file') found.push(file);
  }
  const [first, second] = found;
  if (second !== undefined) {
    throw new LintFailure({
      code: 'CONFIG_INVALID',
      message: `found both ${configFileNames.join(' and ')} in the current directory`,
      help: 'choose one with --config, or remove the other file',
    });
  }
  return first === undefined ? null : selected(first, cwd);
}
