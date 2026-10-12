import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendStepSummary } from '../../src/cli/step-summary.js';
import { tempTree } from '../support/tmp.js';

function recorder(env: Record<string, string | undefined>) {
  let stderr = '';
  return {
    io: {
      env,
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
        },
      },
    },
    stderr: () => stderr,
  };
}

describe('appendStepSummary', () => {
  it('appends to the file GITHUB_STEP_SUMMARY names, keeping what is there', async () => {
    const file = path.join(await tempTree(), 'summary.md');
    await writeFile(file, '## Build\n');
    const { io, stderr } = recorder({ GITHUB_STEP_SUMMARY: file });
    appendStepSummary(io, '### sdc-lint\n');
    expect(await readFile(file, 'utf8')).toBe('## Build\n### sdc-lint\n');
    expect(stderr()).toBe('');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('writes nothing when the variable is %s', async (_case, value) => {
    const directory = await tempTree();
    const { io, stderr } = recorder({ GITHUB_STEP_SUMMARY: value });
    appendStepSummary(io, '### sdc-lint\n');
    expect(stderr()).toBe('');
    expect(await readFile(path.join(directory, 'summary.md'), 'utf8').catch(() => null)).toBeNull();
  });

  it('warns on stderr, without throwing, when the file cannot be written', async () => {
    const file = path.join(await tempTree(), 'missing', 'summary.md');
    const { io, stderr } = recorder({ GITHUB_STEP_SUMMARY: file });
    expect(() => {
      appendStepSummary(io, '### sdc-lint\n');
    }).not.toThrow();
    expect(stderr()).toMatch(
      new RegExp(`^warning: could not write the job summary to ${file.replaceAll('\\', '\\\\')}: `),
    );
  });
});
