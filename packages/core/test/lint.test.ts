import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lint } from '../src/index.js';
import { expectValidReport } from './support/report.js';
import { tempTree } from './support/tmp.js';

const pluginRun = fileURLToPath(new URL('fixtures/cli/plugin-run/', import.meta.url));
const questionnaire = JSON.stringify({ resourceType: 'Questionnaire', id: 'A', status: 'draft' });

describe('lint', () => {
  it('returns a valid completed report for a clean run with built-in defaults', async () => {
    const cwd = await tempTree({ 'fsh-generated/resources/Questionnaire-A.json': questionnaire });
    const report = await lint({ cwd });
    expectValidReport(report);
    expect(report).toMatchObject({
      status: 'completed',
      run: {
        tool: { name: 'sdc-questionnaire-lint' },
        plugins: [{ name: 'sdc' }],
        compat: {},
        selection: 'full',
      },
      findings: [],
      summary: {
        files: { read: 1, skipped: 0 },
        questionnaires: 1,
        expressions: { analysed: 0, unchecked: 0 },
        errors: 0,
        config: null,
        fshSources: [],
        fshSourceLookup: 'enabled',
      },
    });
  });

  it('runs plugin rules from an .mjs config over every Questionnaire', async () => {
    const report = await lint({ cwd: pluginRun, configPath: 'info.config.mjs' });
    expectValidReport(report);
    expect(report.run.plugins).toEqual([
      { name: 'sdc', version: expect.any(String) as unknown },
      { name: 'test', version: '1.0.0' },
    ]);
    expect(report.summary).toMatchObject({
      files: { read: 3, skipped: 1 },
      questionnaires: 3,
      info: 4,
      config: 'info.config.mjs',
    });
  });

  it('makes a targeted run from paths', async () => {
    const report = await lint({
      cwd: pluginRun,
      configPath: 'warning.config.mjs',
      paths: ['fsh-generated/resources/Questionnaire-A.json'],
    });
    expect(report.run.selection).toBe('targeted');
    expect(report.summary.questionnaires).toBe(1);
  });

  it('keeps fingerprints when run from another directory with the same config', async () => {
    const inside = await lint({ cwd: pluginRun, configPath: 'info.config.mjs' });
    const outside = await lint({
      cwd: path.dirname(pluginRun),
      configPath: 'plugin-run/info.config.mjs',
    });
    expect(inside.findings.length).toBeGreaterThan(0);
    expect(outside.findings.map((finding) => finding.fingerprint)).toEqual(
      inside.findings.map((finding) => finding.fingerprint),
    );
  });

  it('fails with a LintFailure for an invalid config', async () => {
    const cwd = await tempTree({ 'sdc-questionnaire-lint.config.json': '{ "files": [] }' });
    await expect(lint({ cwd })).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });
});

describe('FSH sources in the summary', () => {
  const resources = { 'fsh-generated/resources/Questionnaire-A.json': questionnaire };

  it('lists the default input/fsh when it exists', async () => {
    const cwd = await tempTree({ ...resources, 'input/fsh/': '' });
    expect((await lint({ cwd })).summary).toMatchObject({
      fshSources: ['input/fsh'],
      fshSourceLookup: 'enabled',
    });
  });

  it('lists none when input/fsh is absent', async () => {
    const cwd = await tempTree(resources);
    expect((await lint({ cwd })).summary.fshSources).toEqual([]);
  });

  it('lists only the configured directories that exist, sorted', async () => {
    const cwd = await tempTree({
      ...resources,
      'shared/fsh/': '',
      'input/fsh/': '',
      'sdc-questionnaire-lint.config.json': JSON.stringify({
        source: { fsh: ['shared/fsh', 'missing/fsh', 'input/fsh', './input/fsh'] },
      }),
    });
    expect((await lint({ cwd })).summary).toMatchObject({
      fshSources: ['input/fsh', 'shared/fsh'],
      fshSourceLookup: 'enabled',
    });
  });

  it('reports lookup omitted for source.fsh: []', async () => {
    const cwd = await tempTree({
      ...resources,
      'input/fsh/': '',
      'sdc-questionnaire-lint.config.json': JSON.stringify({ source: { fsh: [] } }),
    });
    expect((await lint({ cwd })).summary).toMatchObject({
      fshSources: [],
      fshSourceLookup: 'omitted',
    });
  });
});
