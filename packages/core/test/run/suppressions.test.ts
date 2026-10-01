import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SuppressionEntry } from '../../src/config/types.js';
import { lint } from '../../src/index.js';
import type { ConfigFinding } from '../../src/report/types.js';
import { runBinary } from '../support/cli.js';
import { expectValidReport } from '../support/report.js';
import { tempTree } from '../support/tmp.js';

const testPlugin = pathToFileURL(
  fileURLToPath(new URL('../fixtures/plugins/test-plugin.mjs', import.meta.url)),
).href;
const variable = 'http://hl7.org/fhir/StructureDefinition/variable';

const resources = 'fsh-generated/resources';
const fileA = `${resources}/Questionnaire-A.json`;
const fileB = `${resources}/Bundle-B.json`;

// Questionnaire A: item "name" declares variable %given. The test plugin reports at /item/0
// (finding-per-questionnaire) and at the variable's expression (second-rule).
const questionnaireA = {
  resourceType: 'Questionnaire',
  id: 'A',
  status: 'draft',
  item: [
    {
      linkId: 'name',
      type: 'string',
      extension: [
        {
          url: variable,
          valueExpression: {
            name: 'given',
            language: 'text/fhirpath',
            expression: '%patient.name.given',
          },
        },
      ],
    },
  ],
};
const bundleB = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: ['B1', 'B2'].map((id) => ({
    resource: {
      resourceType: 'Questionnaire',
      id,
      status: 'draft',
      item: [{ linkId: 'q', type: 'boolean' }],
    },
  })),
};

type Entry = Omit<SuppressionEntry, 'reason'> & { reason?: string };

// A temporary IG whose .mjs config loads the test plugin with the given suppressions.
async function ig(suppress: Entry[], config: Record<string, unknown> = {}): Promise<string> {
  const entries = suppress.map((entry) => ({ reason: 'Accepted for the test.', ...entry }));
  return tempTree({
    [fileA]: JSON.stringify(questionnaireA),
    [fileB]: JSON.stringify(bundleB),
    'other/Questionnaire-C.json': JSON.stringify({
      resourceType: 'Questionnaire',
      id: 'C',
      status: 'draft',
    }),
    'sdc-questionnaire-lint.config.mjs':
      `import { testPlugin } from '${testPlugin}';\n` +
      `export default { plugins: [testPlugin()], suppress: ${JSON.stringify(entries)}, ...${JSON.stringify(config)} };\n`,
  });
}

const perQuestionnaire = 'test/finding-per-questionnaire';
const secondRule = 'test/second-rule';

async function run(cwd: string, paths: string[] = []) {
  const report = await lint({ cwd, paths });
  expectValidReport(report);
  return report;
}

function remaining(report: Awaited<ReturnType<typeof run>>): string[] {
  return report.findings.map((finding) =>
    finding.kind === 'questionnaire'
      ? `${finding.ruleId} ${finding.jsonLocation.file}${finding.jsonLocation.pointer}`
      : `${finding.ruleId} ${finding.configLocation.pointer}`,
  );
}

describe('applying suppressions', () => {
  it('runs with four findings when nothing is suppressed', async () => {
    const report = await run(await ig([]));
    expect(remaining(report)).toEqual([
      `${perQuestionnaire} ${fileB}/entry/0/resource/item/0`,
      `${perQuestionnaire} ${fileB}/entry/1/resource/item/0`,
      `${perQuestionnaire} ${fileA}/item/0`,
      `${secondRule} ${fileA}/item/0/extension/0/valueExpression/expression`,
    ]);
  });

  it('removes the findings an entry matches and counts it applied', async () => {
    const report = await run(await ig([{ rule: perQuestionnaire, file: fileA }]));
    expect(remaining(report)).not.toContain(`${perQuestionnaire} ${fileA}/item/0`);
    expect(report.findings).toHaveLength(3);
    expect(report.summary).toMatchObject({
      warnings: 2,
      info: 1,
      suppressedFindings: 1,
      suppressions: { applied: 1, stale: 0, notAssessed: 0 },
    });
  });

  it('counts a finding covered by overlapping entries once', async () => {
    const report = await run(
      await ig([
        { rule: perQuestionnaire, file: fileA },
        { rule: perQuestionnaire, file: fileA, linkId: 'name' },
      ]),
    );
    expect(report.summary).toMatchObject({
      suppressedFindings: 1,
      suppressions: { applied: 2, stale: 0, notAssessed: 0 },
    });
  });

  it('leaves a non-matching entry not assessed and its findings in place', async () => {
    const report = await run(await ig([{ rule: perQuestionnaire, file: fileA, linkId: 'other' }]));
    expect(report.findings).toHaveLength(4);
    expect(report.summary.suppressions).toEqual({ applied: 0, stale: 0, notAssessed: 1 });
  });

  it.each<[string, Entry, string[]]>([
    [
      'linkId',
      { rule: perQuestionnaire, file: fileB, linkId: 'q' },
      [`${fileB}/entry/0/resource/item/0`, `${fileB}/entry/1/resource/item/0`],
    ],
    [
      'resource',
      { rule: perQuestionnaire, file: fileB, resource: 'Questionnaire/B2' },
      [`${fileB}/entry/1/resource/item/0`],
    ],
    [
      'extensionUrl',
      { rule: secondRule, file: fileA, extensionUrl: variable },
      [`${fileA}/item/0/extension/0/valueExpression/expression`],
    ],
    [
      'declaration',
      { rule: secondRule, file: fileA, declaration: 'given' },
      [`${fileA}/item/0/extension/0/valueExpression/expression`],
    ],
    [
      'pointer, covering findings below it',
      { rule: secondRule, file: fileA, pointer: '/item/0/extension/0' },
      [`${fileA}/item/0/extension/0/valueExpression/expression`],
    ],
    [
      'a file path that resolves to the same file',
      { rule: perQuestionnaire, file: `./other/../${fileA}` },
      [`${fileA}/item/0`],
    ],
  ])('matches by %s', async (_name, entry, suppressedPointers) => {
    const report = await run(await ig([entry]));
    for (const pointer of suppressedPointers) {
      expect(remaining(report)).not.toContain(`${entry.rule} ${pointer}`);
    }
    expect(report.summary.suppressedFindings).toBe(suppressedPointers.length);
  });

  it.each<[string, Entry]>([
    ['declaration', { rule: secondRule, file: fileA, declaration: 'other' }],
    ['extensionUrl', { rule: secondRule, file: fileA, extensionUrl: 'http://example.org/other' }],
    ['resource', { rule: perQuestionnaire, file: fileA, resource: 'Questionnaire/B1' }],
    ['pointer', { rule: secondRule, file: fileA, pointer: '/item/1' }],
    ['rule', { rule: secondRule, file: fileB }],
  ])('does not match a different %s', async (_name, entry) => {
    const report = await run(await ig([entry]));
    expect(report.summary.suppressedFindings).toBe(0);
  });

  it('rejects a suppression for an unknown rule, naming a similar one', async () => {
    const cwd = await ig([{ rule: 'test/second-rul', file: fileA }]);
    await expect(lint({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message:
        'config sdc-questionnaire-lint.config.mjs is invalid at /suppress/0/rule: unknown rule test/second-rul',
      help: 'a rule with a similar name exists: test/second-rule',
    });
  });

  it('rejects a suppression of a lint rule', async () => {
    const cwd = await ig([{ rule: 'lint/stale-suppression', file: fileA }]);
    await expect(lint({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      help: 'set "lint/stale-suppression": "off" in rules instead',
    });
  });
});

describe('assessing suppressions in a targeted run', () => {
  it('does not assess a suppression for a deleted file outside the selection', async () => {
    // docs/examples/reports/targeted.json: lint A.json with a suppression for a deleted B.json.
    const cwd = await ig([
      { rule: perQuestionnaire, file: `${resources}/Questionnaire-Deleted.json` },
    ]);
    const report = await run(cwd, [fileA]);
    expect(report.run.selection).toBe('targeted');
    expect(report.findings.some((finding) => finding.kind === 'config')).toBe(false);
    expect(report.summary.suppressions).toEqual({ applied: 0, stale: 0, notAssessed: 1 });
  });

  it('applies suppressions for selected files and leaves the others not assessed', async () => {
    const cwd = await ig([
      { rule: perQuestionnaire, file: fileA },
      { rule: perQuestionnaire, file: fileB },
      { rule: perQuestionnaire, file: 'gone.json' },
    ]);
    const report = await run(cwd, [fileA]);
    expect(report.summary.suppressions).toEqual({ applied: 1, stale: 0, notAssessed: 2 });
  });
});

describe('assessing suppressions in a full run', () => {
  const deleted = `${resources}/Questionnaire-Deleted.json`;

  it('reports a suppression for a deleted file as stale', async () => {
    // docs/examples/reports/stale-suppression.json.
    const cwd = await ig([{ rule: perQuestionnaire, file: deleted, linkId: 'name' }]);
    const report = await run(cwd);
    const stale = report.findings.filter((finding) => finding.kind === 'config');
    expect(stale).toEqual([
      {
        kind: 'config',
        ruleId: 'lint/stale-suppression',
        severity: 'warning',
        message: `A suppression targets ${deleted}, which no longer exists.`,
        help: 'remove this suppression from the configuration',
        configLocation: { file: 'sdc-questionnaire-lint.config.mjs', pointer: '/suppress/0' },
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      },
    ]);
    expect(report.summary).toMatchObject({
      warnings: 4,
      suppressions: { applied: 0, stale: 1, notAssessed: 0 },
    });
  });

  it('keeps a stale finding’s fingerprint when the suppress array is reordered', async () => {
    const entry = { rule: perQuestionnaire, file: deleted };
    const other = { rule: perQuestionnaire, file: fileB };
    const first = (await run(await ig([entry, other]))).findings.find(
      (finding): finding is ConfigFinding => finding.kind === 'config',
    );
    const second = (await run(await ig([other, entry]))).findings.find(
      (finding): finding is ConfigFinding => finding.kind === 'config',
    );
    expect(second?.configLocation.pointer).toBe('/suppress/1');
    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it('does not assess an existing file outside the configured inputs', async () => {
    const cwd = await ig([{ rule: perQuestionnaire, file: 'other/Questionnaire-C.json' }], {
      files: [resources],
    });
    const report = await run(cwd);
    expect(report.summary.suppressions).toEqual({ applied: 0, stale: 0, notAssessed: 1 });
  });

  it('counts a stale entry without a finding when lint/stale-suppression is off', async () => {
    const cwd = await ig([{ rule: perQuestionnaire, file: deleted }], {
      rules: { 'lint/stale-suppression': 'off' },
    });
    const report = await run(cwd);
    expect(report.findings.some((finding) => finding.kind === 'config')).toBe(false);
    expect(report.summary.suppressions).toEqual({ applied: 0, stale: 1, notAssessed: 0 });
  });

  it('puts every entry in exactly one state', async () => {
    const cwd = await ig([
      { rule: perQuestionnaire, file: fileA },
      { rule: perQuestionnaire, file: deleted },
      { rule: secondRule, file: fileB },
      { rule: perQuestionnaire, file: fileA, linkId: 'missing' },
    ]);
    const { suppressions } = (await run(cwd)).summary;
    expect(suppressions).toEqual({ applied: 1, stale: 1, notAssessed: 2 });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails when the existence of a suppressed file cannot be checked',
    async () => {
      const cwd = await ig([{ rule: perQuestionnaire, file: 'locked/Questionnaire-L.json' }], {
        files: [resources],
      });
      const locked = path.join(cwd, 'locked');
      await mkdir(locked);
      await writeFile(path.join(locked, 'Questionnaire-L.json'), '{}');
      await chmod(locked, 0o000);
      try {
        await expect(lint({ cwd })).rejects.toMatchObject({
          code: 'INPUT_UNREADABLE',
          path: 'locked/Questionnaire-L.json',
        });
      } finally {
        await chmod(path.join(cwd, 'locked'), 0o755);
      }
    },
  );

  it('shows the config location in text output', async () => {
    const cwd = await ig([{ rule: perQuestionnaire, file: deleted }]);
    const result = runBinary(['lint'], { cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `sdc-questionnaire-lint.config.mjs: warning lint/stale-suppression A suppression targets ${deleted}, which no longer exists.\n` +
        '  location: /suppress/0\n' +
        '  help: remove this suppression from the configuration\n',
    );
    expect(result.stdout).toContain('Suppressions: 0 applied, 1 stale, 0 not assessed.\n');
  });
});
