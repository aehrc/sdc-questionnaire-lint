import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport } from '../../src/index.js';
import { runBinary, runExecutable, runInProcess, runPiped } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

// Cross-cutting checks of the CLI contract (docs/cli.md) that no single task covers. Every JSON
// document these and the other CLI tests capture is validated by the helpers in support/cli.ts.

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
const pluginRun = path.join(fixtures, 'cli', 'plugin-run');
const nested = path.join(fixtures, 'cli', 'nested');
const testPlugin = pathToFileURL(path.join(fixtures, 'plugins', 'test-plugin.mjs')).href;

function report(stdout: string): CompletedReport {
  return JSON.parse(stdout) as CompletedReport;
}

describe('the sdc-questionnaire-lint alias', () => {
  it.each<[string, string[], string]>([
    ['help', ['lint', '--help'], pluginRun],
    ['a completed run', ['lint', '--config', 'warning.config.mjs', '--format', 'json'], pluginRun],
    ['a failure', ['lint', 'missing.json'], pluginRun],
    ['explain', ['explain', '--config', 'warning.config.mjs'], pluginRun],
  ])('matches sdc-lint byte for byte for %s', (_name, argv, cwd) => {
    const primary = runExecutable('sdc-lint', argv, { cwd });
    expect(runExecutable('sdc-questionnaire-lint', argv, { cwd })).toEqual(primary);
    expect(primary.stdout + primary.stderr).not.toBe('');
  });
});

describe('output stability', () => {
  const argv = ['lint', '--config', 'warning.config.mjs'];

  it('is identical with and without CI', () => {
    const withCi = runBinary(argv, { cwd: pluginRun, env: { ...process.env, CI: 'true' } });
    const withoutCi = { ...process.env };
    delete withoutCi.CI;
    expect(withCi).toEqual(runBinary(argv, { cwd: pluginRun, env: withoutCi }));
  });

  it('is identical when stdout is piped to another process', () => {
    for (const format of ['text', 'json']) {
      const args = [...argv, '--format', format];
      expect(runPiped(args, { cwd: pluginRun }).stdout).toBe(
        runBinary(args, { cwd: pluginRun }).stdout,
      );
    }
  });

  it('is identical in process and in a separate process', async () => {
    const args = [...argv, '--format', 'json'];
    const inProcess = await runInProcess(args, { cwd: pluginRun, env: process.env });
    expect(inProcess).toEqual(runBinary(args, { cwd: pluginRun }));
  });
});

describe('path bases', () => {
  it('accepts an absolute input path and an absolute --config', () => {
    const result = runBinary(
      [
        'lint',
        '--config',
        path.join(pluginRun, 'warning.config.mjs'),
        '--format',
        'json',
        path.join(pluginRun, 'fsh-generated', 'resources', 'Questionnaire-A.json'),
      ],
      { cwd: fixtures },
    );
    expect(result.code).toBe(0);
    const { run, summary, findings } = report(result.stdout);
    expect(run.selection).toBe('targeted');
    expect(summary.config).toBe('cli/plugin-run/warning.config.mjs');
    expect(findings[0]?.kind === 'questionnaire' && findings[0].jsonLocation.file).toBe(
      'cli/plugin-run/fsh-generated/resources/Questionnaire-A.json',
    );
  });

  it('resolves defaults beneath an explicit config in a subdirectory', () => {
    // From the parent of ig: ig/fsh-generated and ig/input/fsh, not the decoys beside ig.
    const result = runBinary(
      ['lint', '--config', 'ig/sdc-questionnaire-lint.config.json', '--format', 'json'],
      { cwd: nested },
    );
    expect(result.code).toBe(0);
    expect(report(result.stdout)).toMatchObject({
      run: { selection: 'full' },
      summary: {
        questionnaires: 1,
        config: 'ig/sdc-questionnaire-lint.config.json',
        fshSources: ['ig/input/fsh'],
      },
    });
  });

  it('keeps an extra CLI path relative to the caller', () => {
    const result = runBinary(
      [
        'lint',
        '--config',
        'ig/sdc-questionnaire-lint.config.json',
        '--format',
        'json',
        'extra/Bundle-Extra.json',
      ],
      { cwd: nested },
    );
    expect(result.code).toBe(0);
    expect(report(result.stdout)).toMatchObject({
      run: { selection: 'targeted' },
      summary: { questionnaires: 3, files: { read: 1, skipped: 0 } },
    });
  });
});

describe('large reports', () => {
  it('arrive complete when stdout is a pipe', async () => {
    const count = 5000;
    const entry = Array.from({ length: count }, (_, index) => ({
      resource: { resourceType: 'Questionnaire', id: `Q${String(index)}`, status: 'draft' },
    }));
    const cwd = await tempTree({
      'fsh-generated/resources/Bundle-Many.json': JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry,
      }),
      'sdc-questionnaire-lint.config.mjs':
        `import { testPlugin } from '${testPlugin}';\n` +
        "export default { plugins: [testPlugin({ severity: 'warning' })], rules: { 'test/second-rule': 'off' } };\n",
    });
    const result = runBinary(['lint', '--format', 'json'], { cwd });
    expect(result.code).toBe(0);
    // Far beyond a pipe buffer (64 KiB on Linux and macOS).
    expect(result.stdout.length).toBeGreaterThan(1024 * 1024);
    expect(report(result.stdout).findings).toHaveLength(count);
  });
});
