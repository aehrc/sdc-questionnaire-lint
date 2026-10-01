import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runBinary } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

const configs = fileURLToPath(new URL('../fixtures/config/', import.meta.url));
const unloadable = fileURLToPath(new URL('../fixtures/cli/unloadable-config/', import.meta.url));
const withPlugin = ['--config', 'with-plugin.mjs'];

describe('sdc-lint explain', () => {
  it('lists the registered rules without a config, in a directory without generated files', async () => {
    const cwd = await tempTree();
    const result = runBinary(['explain'], { cwd });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'RULE                    DEFAULT  EFFECTIVE  STATUS   DESCRIPTION\n' +
        'lint/stale-suppression  warning  warning    enabled  Reports a suppression that the run establishes is no longer needed.\n' +
        '\n' +
        'Config: none, built-in defaults.\n' +
        "Run sdc-lint explain <rule-id> for a rule's documentation.\n",
    );
  });

  it('lists plugin rules from an .mjs config, including rules configured off, sorted by ID', () => {
    const result = runBinary(['explain', ...withPlugin], { cwd: configs });
    expect(result.code).toBe(0);
    const rows = result.stdout.split('\n').slice(1, 4);
    expect(rows.map((row) => row.split(/\s{2,}/))).toEqual([
      [
        'lint/stale-suppression',
        'warning',
        'warning',
        'enabled',
        'Reports a suppression that the run establishes is no longer needed.',
      ],
      [
        'test/finding-per-questionnaire',
        'warning',
        'error',
        'enabled',
        'Reports one finding per Questionnaire.',
      ],
      [
        'test/second-rule',
        'info',
        'off',
        'disabled',
        'Reports the first expression of the first item.',
      ],
    ]);
    expect(result.stdout).toContain('\nConfig: with-plugin.mjs.\n');
  });

  it('fails with exit 2 on an invalid config, writing only to stderr', () => {
    const result = runBinary(['explain'], { cwd: unloadable });
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: found both sdc-questionnaire-lint\.config\.json and /);
  });

  it('fails with exit 2 when the config module throws', () => {
    const result = runBinary(['explain', '--config', 'throws.mjs'], { cwd: configs });
    expect(result).toMatchObject({
      code: 2,
      stdout: '',
      stderr: expect.stringMatching(
        /^error: config throws\.mjs failed to load: the config module is broken\n/,
      ) as unknown,
    });
  });
});

describe('sdc-lint explain <rule-id>', () => {
  it('prints every documentation section with severities', async () => {
    const result = runBinary(['explain', 'lint/stale-suppression'], { cwd: await tempTree() });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(
      /^lint\/stale-suppression\nReports a suppression that the run establishes is no longer needed\.\n\nDefault severity: warning\. Effective severity: warning \(enabled\)\.\n/,
    );
    for (const heading of [
      'What it checks',
      'Why it matters',
      'Example message',
      'How to fix it',
      'Known limitations',
    ]) {
      expect(result.stdout).toMatch(new RegExp(`\\n\\n${heading}\\n  \\S`));
    }
    expect(result.stdout.endsWith('\nConfig: none, built-in defaults.\n')).toBe(true);
  });

  it('explains a rule configured off, and says when a plugin ships no documentation', () => {
    const result = runBinary(['explain', 'test/second-rule', ...withPlugin], { cwd: configs });
    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout:
        'test/second-rule\n' +
        'Reports the first expression of the first item.\n' +
        '\n' +
        'Default severity: info. Effective severity: off (disabled).\n' +
        '\n' +
        'The test plugin ships no bundled documentation for this rule.\n' +
        '\n' +
        'Config: with-plugin.mjs.\n',
    });
  });

  it('suggests a similar rule for a misspelt ID', () => {
    const result = runBinary(['explain', 'test/finding-per-questionaire', ...withPlugin], {
      cwd: configs,
    });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: unknown rule test/finding-per-questionaire\n' +
        'help: a rule with a similar name exists: test/finding-per-questionnaire\n',
    });
  });

  it('explains that an unregistered namespace needs its plugin in an .mjs config', async () => {
    const result = runBinary(['explain', 'smart-forms/flat-variable-context'], {
      cwd: await tempTree(),
    });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: unknown rule smart-forms/flat-variable-context\n' +
        'help: the plugin providing smart-forms/ rules must be listed in plugins in an .mjs config\n',
    });
  });

  it('points to the rule list for an unknown rule in a registered namespace', async () => {
    const result = runBinary(['explain', 'sdc/undefined-variable'], { cwd: await tempTree() });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      'error: unknown rule sdc/undefined-variable\n' +
        'help: run sdc-lint explain to list the registered rules\n',
    );
  });
});
