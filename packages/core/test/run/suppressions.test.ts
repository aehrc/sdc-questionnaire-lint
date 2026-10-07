import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import { loadConfig } from '../../src/config/load.js';
import { resolveRunPaths } from '../../src/config/paths.js';
import { loadInputs } from '../../src/inputs/load-inputs.js';
import { lint } from '../../src/lint.js';
import { completesCheck, sdcPlugin } from '../../src/plugins/builtin.js';
import { resolveRuleSet } from '../../src/plugins/rule-set.js';
import { configFingerprint } from '../../src/run/fingerprint.js';
import { runRules } from '../../src/run/rules.js';
import { applySuppressions } from '../../src/run/suppressions.js';
import { tempTree } from '../support/tmp.js';

const configName = 'sdc-questionnaire-lint.config.json';
const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const A = 'fsh-generated/resources/Questionnaire-A.json';
const B = 'fsh-generated/resources/Questionnaire-B.json';

const fhirPath = (expression: string) => ({ language: 'text/fhirpath', expression });

function calculated(expression: string, language = 'text/fhirpath') {
  return { url: `${sdc}calculatedExpression`, valueExpression: { language, expression } };
}

function variable(name: string, expression: string) {
  return { url: VARIABLE, valueExpression: { name, ...fhirPath(expression) } };
}

function questionnaire(id: string, extension: unknown[], more: Record<string, unknown> = {}) {
  return JSON.stringify({
    resourceType: 'Questionnaire',
    id,
    status: 'draft',
    item: [{ linkId: 'q', type: 'decimal', extension }],
    ...more,
  });
}

const broken = questionnaire('A', [calculated('a.where(')]);
const fixed = questionnaire('A', [calculated('a.where(b)')]);

interface Run {
  suppress: unknown[];
  rules?: Record<string, string>;
  files?: string[];
  paths?: string[];
}

// Writes the tree and a config with suppress, then runs the pipeline up to the assessment.
async function assessIn(cwd: string, { suppress, rules, files, paths }: Run) {
  await writeFile(path.join(cwd, configName), JSON.stringify({ rules, files, suppress }));
  const loaded = await loadConfig({ cwd });
  const resolved = resolveRuleSet(loaded).rules;
  const runPaths = resolveRunPaths({ cwd, config: loaded });
  const inputs = await loadInputs({ cwd, cliPaths: paths ?? [], runPaths });
  const documents = inputs.documents.map(({ input, document }) => ({
    input,
    document,
    sites: findExpressionSites(document),
  }));
  const findings = documents.flatMap((doc) => runRules(doc, resolved));
  const outcome = await applySuppressions({
    loaded,
    rules: resolved,
    runKind: inputs.runKind,
    inputFiles: inputs.inputFiles,
    documents,
    findings,
    cwd,
  });
  return { findings, outcome };
}

async function assess(tree: Record<string, string>, run: Run) {
  return assessIn(await tempTree(tree), run);
}

const entry = (more: Record<string, string> = {}) => ({
  rule: 'sdc/parse-error',
  file: A,
  linkId: 'q',
  reason: 'demo',
  ...more,
});

const counts = (applied: number, stale: number, notAssessed: number) => ({
  applied,
  stale,
  notAssessed,
});

describe('applySuppressions: assessment states', () => {
  it('applies a suppression whose rule has findings at the selected site', async () => {
    const { outcome } = await assess({ [A]: broken }, { suppress: [entry()] });
    expect(outcome).toEqual({
      findings: [],
      suppressedFindings: 1,
      suppressions: counts(1, 0, 0),
    });
  });

  it('is stale when the rule completed its check at the site and found nothing', async () => {
    const { outcome } = await assess({ [A]: fixed }, { suppress: [entry()] });
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
    expect(outcome.findings).toEqual([
      {
        kind: 'config',
        ruleId: 'lint/stale-suppression',
        severity: 'warning',
        message:
          'A suppression of sdc/parse-error hides nothing: the rule checked this expression and found no problem.',
        help: 'remove this entry from suppress',
        configLocation: { file: configName, pointer: '/suppress/0' },
        fingerprint: configFingerprint('lint/stale-suppression', entry()),
      },
    ]);
  });

  it('keeps stale fingerprints when entries change order or reason', async () => {
    const gone = entry({ file: 'Gone.json' });
    const unmatched = entry({ linkId: 'gone' });
    const before = await assess({ [A]: fixed }, { suppress: [gone, unmatched] });
    const after = await assess(
      { [A]: fixed },
      { suppress: [{ ...unmatched, reason: 'another reason' }, gone] },
    );
    const fingerprints = (findings: readonly { fingerprint: string }[]) =>
      findings.map(({ fingerprint }) => fingerprint);
    expect(fingerprints(after.outcome.findings)).toEqual(
      fingerprints(before.outcome.findings).reverse(),
    );
  });

  it('is not assessed when the rule does not check the site', async () => {
    const { outcome } = await assess(
      { [A]: questionnaire('A', [calculated('a.where(', 'text/cql')]) },
      { suppress: [entry()] },
    );
    expect(outcome).toEqual({
      findings: [],
      suppressedFindings: 0,
      suppressions: counts(0, 0, 1),
    });
  });

  it('is stale when no expression in the selected file matches', async () => {
    const { outcome } = await assess({ [A]: fixed }, { suppress: [entry({ linkId: 'gone' })] });
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
    expect(outcome.findings).toMatchObject([
      {
        ruleId: 'lint/stale-suppression',
        message: `A suppression of sdc/parse-error matches no expression in ${A}.`,
        help: "remove this entry, or update its selectors to the expression's current linkId, extensionUrl or name",
        configLocation: { pointer: '/suppress/0' },
      },
    ]);
  });

  it('fails when the selectors match several expressions', async () => {
    const tree = {
      [A]: questionnaire('A', [calculated('a.where('), variable('v', 'b.where(')]),
    };
    await expect(assess(tree, { suppress: [entry()] })).rejects.toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${configName} is invalid at /suppress/0: it matches 2 expressions, at /item/0/extension/0/valueExpression/expression and /item/0/extension/1/valueExpression/expression`,
        help: 'add extensionUrl, name or pointer to select one expression',
      }),
    );
  });

  it('is not assessed in a targeted run when the file is not selected', async () => {
    const { outcome } = await assess(
      { [A]: broken, [B]: fixed },
      { suppress: [entry({ file: B })], paths: [A] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 0, 1));
    expect(outcome.findings).toMatchObject([{ ruleId: 'sdc/parse-error' }]);
  });

  it('is not assessed in a targeted run when the file does not exist', async () => {
    const { outcome } = await assess(
      { [A]: fixed },
      { suppress: [entry({ file: 'fsh-generated/resources/Gone.json' })], paths: [A] },
    );
    expect(outcome).toEqual({ findings: [], suppressedFindings: 0, suppressions: counts(0, 0, 1) });
  });

  it.each([
    ['ENOENT', 'fsh-generated/resources/Gone.json'],
    ['ENOTDIR', `${A}/Gone.json`],
  ])('is stale in a full run when the file does not exist (%s)', async (_, file) => {
    const { outcome } = await assess({ [A]: fixed }, { suppress: [entry({ file })] });
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
    expect(outcome.findings).toMatchObject([
      {
        ruleId: 'lint/stale-suppression',
        message: `A suppression of sdc/parse-error targets ${file}, which no longer exists.`,
        help: 'remove this entry from suppress',
        configLocation: { file: configName, pointer: '/suppress/0' },
      },
    ]);
  });

  it('is not assessed in a full run when the file exists but is not selected', async () => {
    const { outcome } = await assess(
      { [A]: fixed, [B]: broken },
      { suppress: [entry({ file: B })], files: [A] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 0, 1));
  });

  describe.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a target whose existence cannot be checked',
    () => {
      async function lockedTree() {
        const cwd = await tempTree({ [A]: fixed, 'locked/Questionnaire-L.json': fixed });
        const locked = path.join(cwd, 'locked');
        await chmod(locked, 0o000);
        // tempTree removes the tree after the test, which needs the directory readable again.
        return { cwd, unlock: () => chmod(locked, 0o755) };
      }
      const suppress = [entry({ file: 'locked/Questionnaire-L.json' })];

      it('is not assessed in a targeted run', async () => {
        const { cwd, unlock } = await lockedTree();
        try {
          const { outcome } = await assessIn(cwd, { suppress, paths: [A] });
          expect(outcome.suppressions).toEqual(counts(0, 0, 1));
        } finally {
          await unlock();
        }
      });

      it('fails a full run with INPUT_UNREADABLE', async () => {
        const { cwd, unlock } = await lockedTree();
        try {
          await expect(assessIn(cwd, { suppress, files: [A] })).rejects.toMatchObject({
            code: 'INPUT_UNREADABLE',
            path: 'locked/Questionnaire-L.json',
          });
        } finally {
          await unlock();
        }
      });
    },
  );

  it('is stale when a selected Bundle no longer contains a Questionnaire', async () => {
    const bundle = 'fsh-generated/resources/Bundle-C.json';
    const { outcome } = await assess(
      {
        [A]: fixed,
        [bundle]: JSON.stringify({
          resourceType: 'Bundle',
          entry: [{ resource: { resourceType: 'Patient', id: 'p' } }],
        }),
      },
      { suppress: [entry({ file: bundle })] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
    expect(outcome.findings).toMatchObject([
      { message: `A suppression of sdc/parse-error matches no expression in ${bundle}.` },
    ]);
  });

  it('is stale when the selected file no longer holds a Questionnaire', async () => {
    const { outcome } = await assess(
      { [A]: fixed, [B]: JSON.stringify({ resourceType: 'Patient', id: 'B' }) },
      { suppress: [entry({ file: B })] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
  });
});

describe('applySuppressions: whether the rule completed its check', () => {
  it('is not assessed when the suppressed rule is off', async () => {
    const { outcome } = await assess(
      { [A]: fixed },
      { suppress: [entry()], rules: { 'sdc/parse-error': 'off' } },
    );
    expect(outcome).toEqual({ findings: [], suppressedFindings: 0, suppressions: counts(0, 0, 1) });
  });

  it('is not assessed for sdc/unknown-function on text that does not parse', async () => {
    const { outcome } = await assess(
      { [A]: broken },
      { suppress: [entry({ rule: 'sdc/unknown-function' })] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 0, 1));
  });

  it('is stale for sdc/unknown-function on text that parses', async () => {
    const { outcome } = await assess(
      { [A]: fixed },
      { suppress: [entry({ rule: 'sdc/unknown-function' })] },
    );
    expect(outcome.suppressions).toEqual(counts(0, 1, 0));
  });

  it('knows where every sdc rule completes its check', () => {
    const ids = Object.keys(sdcPlugin.rules).map((name) => `${sdcPlugin.meta.name}/${name}`);
    expect(Object.keys(completesCheck).sort()).toEqual(ids.sort());
  });

  it('is not assessed for a plugin rule that reports nothing', async () => {
    const cwd = await tempTree({
      [A]: fixed,
      'sdc-questionnaire-lint.config.mjs': `export default {
        plugins: [{
          meta: { name: 'demo', version: '0.0.0' },
          rules: {
            quiet: {
              meta: { description: 'Reports nothing.', defaultSeverity: 'error' },
              check() {},
            },
          },
        }],
        suppress: [${JSON.stringify(entry({ rule: 'demo/quiet' }))}],
      };`,
    });
    const report = await lint({ cwd });
    expect(report.findings).toEqual([]);
    expect(report.summary.suppressions).toEqual(counts(0, 0, 1));
  });

  it('counts a would-be stale entry as not assessed when lint/stale-suppression is off', async () => {
    const { outcome } = await assess(
      { [A]: fixed },
      {
        suppress: [entry(), entry({ file: 'Gone.json' }), entry({ linkId: 'gone' })],
        rules: { 'lint/stale-suppression': 'off' },
      },
    );
    expect(outcome).toEqual({ findings: [], suppressedFindings: 0, suppressions: counts(0, 0, 3) });
  });
});

describe('applySuppressions: what an entry hides', () => {
  const query = (expression: string) => ({
    url: `${sdc}itemPopulationContext`,
    valueExpression: { name: 'obs', language: 'application/x-fhir-query', expression },
  });

  it('hides a fragment finding through a suppression of its query', async () => {
    const { findings, outcome } = await assess(
      { [A]: questionnaire('A', [query('Observation?subject={{%patient.id.}}')]) },
      { suppress: [entry({ rule: 'sdc/fragment-parse-error' })] },
    );
    expect(findings).toMatchObject([{ ruleId: 'sdc/fragment-parse-error' }]);
    expect(outcome).toEqual({ findings: [], suppressedFindings: 1, suppressions: counts(1, 0, 0) });
  });

  it('counts two entries on one site as two applied and one suppressed finding', async () => {
    const { outcome } = await assess(
      { [A]: broken },
      { suppress: [entry(), entry({ extensionUrl: `${sdc}calculatedExpression` })] },
    );
    expect(outcome).toEqual({ findings: [], suppressedFindings: 1, suppressions: counts(2, 0, 0) });
  });

  it("hides every finding of the rule at the site, but not other rules' findings", async () => {
    const { findings, outcome } = await assess(
      { [A]: questionnaire('A', [calculated('a.fist() + b.frist() + c.foo()')]) },
      { suppress: [entry({ rule: 'sdc/unknown-function' })] },
    );
    expect(findings).toHaveLength(3);
    expect(outcome).toEqual({ findings: [], suppressedFindings: 3, suppressions: counts(1, 0, 0) });

    const both = await assess(
      {
        [A]: JSON.stringify({
          resourceType: 'Questionnaire',
          status: 'draft',
          item: [
            {
              linkId: 'q',
              answerOption: [
                {
                  valueString: 'x',
                  extension: [{ url: 'http://example.org/x', valueExpression: fhirPath('a.(') }],
                },
              ],
            },
          ],
        }),
      },
      { suppress: [entry()] },
    );
    expect(both.findings.map(({ ruleId }) => ruleId)).toEqual([
      'sdc/parse-error',
      'sdc/uncatalogued-expression',
    ]);
    expect(both.outcome.findings).toMatchObject([{ ruleId: 'sdc/uncatalogued-expression' }]);
    expect(both.outcome.suppressedFindings).toBe(1);
  });
});

describe('applySuppressions: selectors', () => {
  const bundle = 'fsh-generated/resources/Bundle-C.json';
  const twoQuestionnaires = JSON.stringify({
    resourceType: 'Bundle',
    entry: [
      { resource: JSON.parse(questionnaire('X', [calculated('a.where(')])) as unknown },
      { resource: JSON.parse(questionnaire('Y', [calculated('b.where(')])) as unknown },
    ],
  });

  it('fails when linkId matches a site in each Questionnaire of a Bundle', async () => {
    await expect(
      assess({ [bundle]: twoQuestionnaires }, { suppress: [entry({ file: bundle })] }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        help: 'add resource, extensionUrl, name or pointer to select one expression',
      }),
    );
  });

  it('selects one site with resource', async () => {
    const { outcome } = await assess(
      { [bundle]: twoQuestionnaires },
      { suppress: [entry({ file: bundle, resource: 'Questionnaire/Y' })] },
    );
    expect(outcome.findings).toMatchObject([
      { jsonLocation: { resource: { id: 'X' } }, ruleId: 'sdc/parse-error' },
    ]);
    expect(outcome.suppressions).toEqual(counts(1, 0, 0));
  });

  it('selects an expression in a contained resource with pointer', async () => {
    const pointer = '/contained/0/extension/0/valueExpression/expression';
    const { outcome } = await assess(
      {
        [A]: JSON.stringify({
          resourceType: 'Questionnaire',
          status: 'draft',
          contained: [
            {
              resourceType: 'Library',
              id: 'lib',
              extension: [{ url: 'http://example.org/x', valueExpression: fhirPath('a.(') }],
            },
          ],
        }),
      },
      {
        suppress: [{ rule: 'sdc/parse-error', file: A, pointer, reason: 'demo' }],
        rules: { 'sdc/uncatalogued-expression': 'off' },
      },
    );
    expect(outcome).toEqual({ findings: [], suppressedFindings: 1, suppressions: counts(1, 0, 0) });
  });

  it('tells two variables on one item apart by name', async () => {
    const { outcome } = await assess(
      { [A]: questionnaire('A', [variable('x', 'a.where('), variable('y', 'b.where(')]) },
      { suppress: [entry({ name: 'y' })] },
    );
    expect(outcome.findings).toMatchObject([
      { jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression' } },
    ]);
    expect(outcome.suppressions).toEqual(counts(1, 0, 0));
  });
});
