import { appendFileSync } from 'node:fs';
import { describeError } from '../failure.js';
import type { CliIo } from './run.js';

// Appends Markdown to the GitHub Actions job summary, the file $GITHUB_STEP_SUMMARY names; outside
// Actions the variable is unset and nothing is written. The findings are already on stdout, so a
// file that cannot be written is a warning, never a failure: the exit status stays the run's own.
export function appendStepSummary(io: Pick<CliIo, 'env' | 'stderr'>, markdown: string): void {
  const file = io.env.GITHUB_STEP_SUMMARY;
  if (file === undefined || file === '') return;
  try {
    appendFileSync(file, markdown);
  } catch (error) {
    io.stderr.write(
      `warning: could not write the job summary to ${file}: ${describeError(error)}\n`,
    );
  }
}
