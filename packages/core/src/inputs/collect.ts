import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { RunPaths } from '../config/paths.js';
import { LintFailure } from '../failure.js';
import { expandEntries } from './expand.js';
import { canonicalFiles, displayPath } from './paths.js';
import { readInputs, type ReadResult } from './read.js';
import { type InputEntry, selectInputs } from './select.js';

export interface CollectedInputs extends ReadResult {
  selection: 'targeted' | 'full';
}

const listedEntries = 3;

function noQuestionnaires(entries: readonly InputEntry[], cwd: string): LintFailure {
  const shown = entries.slice(0, listedEntries).map((entry) => entry.display);
  const more = entries.length - shown.length;
  const list = more > 0 ? `${shown.join(', ')} and ${String(more)} more` : shown.join(', ');
  const [only] = entries;
  let help =
    'pass paths to Questionnaire or Bundle JSON files, or list them in files in the config';
  if (only?.origin === 'default') {
    // The default directory is fsh-generated/resources beneath the IG, so SUSHI builds it.
    const ig = displayPath(path.dirname(path.dirname(only.absolute)), cwd);
    help = `run sushi ${ig} to generate ${only.display}, then lint again; or ${help}`;
  }
  return new LintFailure({
    code: 'NO_QUESTIONNAIRES',
    ...(entries.length === 1 && only ? { path: only.display } : {}),
    message: `no Questionnaires found in ${list}`,
    help,
  });
}

// Selects, expands, deduplicates and reads the inputs for one run.
export async function collectInputs({
  cwd,
  cliPaths,
  runPaths,
}: {
  cwd: string;
  cliPaths: readonly string[];
  runPaths: RunPaths;
}): Promise<CollectedInputs> {
  const { selection, entries } = selectInputs({ cwd, cliPaths, runPaths });
  const files = await canonicalFiles(await expandEntries(entries), await realpath(cwd));
  const read = await readInputs(files);
  if (read.documents.length === 0) throw noQuestionnaires(entries, cwd);
  return { selection, ...read };
}
