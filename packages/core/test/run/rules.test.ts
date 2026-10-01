import { describe, expect, it } from 'vitest';
import type { LoadedConfig } from '../../src/config/load.js';
import type { LintConfig } from '../../src/config/types.js';
import { buildRegistry } from '../../src/plugins/registry.js';
import type {
  LintPlugin,
  LintRule,
  QuestionnaireDocument,
  RuleFinding,
} from '../../src/plugins/types.js';
import { configFingerprint } from '../../src/run/fingerprint.js';
import { runRules } from '../../src/run/rules.js';
import { createSourceMap } from '../../src/run/source-map.js';

const calculated =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression';
const variable = 'http://hl7.org/fhir/StructureDefinition/variable';

function item(linkId: string) {
  return {
    linkId,
    type: 'string',
    extension: [
      { url: variable, valueExpression: { name: 'given', expression: '%patient.name.given' } },
      { url: calculated, valueExpression: { expression: '%given.first()' } },
    ],
  };
}

function document(resource: Record<string, unknown>, resourcePointer = ''): QuestionnaireDocument {
  return {
    file: 'fsh-generated/resources/Questionnaire-A.json',
    resource: { resourceType: 'Questionnaire', ...resource },
    resourcePointer,
    localResources: [],
  };
}

// A plugin with one rule that reports whatever report() returns for each document.
function reporting(
  report: (document: QuestionnaireDocument) => RuleFinding[],
  meta = {},
): LintPlugin {
  const rule: LintRule = {
    meta: { description: 'Reports test findings.', defaultSeverity: 'warning', ...meta },
    check(ctx) {
      for (const finding of report(ctx.document)) ctx.report(finding);
    },
  };
  return { meta: { name: 'test', version: '1.0.0' }, rules: { rule } };
}

function run(plugin: LintPlugin, documents: QuestionnaireDocument[], config: LintConfig = {}) {
  const loaded: LoadedConfig = {
    path: '/c.mjs',
    dir: '/',
    display: 'c.mjs',
    format: 'mjs',
    config: { plugins: [plugin], ...config },
  };
  return runRules({
    documents,
    rules: buildRegistry(loaded).rules,
    sourceMap: createSourceMap({ directories: [], sushiIndex: '/index.json' }),
  }).map((result) => result.finding);
}

const calculatedPointer = (index: number) =>
  `/item/${String(index)}/extension/1/valueExpression/expression`;

describe('runRules', () => {
  it('attaches the rule ID, severity, locations and expression excerpt', () => {
    const findings = run(
      reporting(
        () => [
          {
            message: 'Something is wrong.',
            help: 'fix it',
            note: 'context',
            pointer: calculatedPointer(0),
            range: { startOffset: 0, endOffset: 6 },
          },
        ],
        { docsUrl: 'https://example.org/rule' },
      ),
      [document({ id: 'A', item: [item('name')] })],
    );
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'test/rule',
        severity: 'warning',
        message: 'Something is wrong.',
        help: 'fix it',
        note: 'context',
        docsUrl: 'https://example.org/rule',
        jsonLocation: {
          file: 'fsh-generated/resources/Questionnaire-A.json',
          pointer: calculatedPointer(0),
          resource: { resourceType: 'Questionnaire', id: 'A', pointer: '' },
          linkId: 'name',
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text: '%given.first()', range: { startOffset: 0, endOffset: 6 } },
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      },
    ]);
  });

  it('defaults the location to the resource and omits an absent ID', () => {
    const [finding] = run(
      reporting(() => [{ message: 'Bundle entry.' }]),
      [document({}, '/entry/2/resource')],
    );
    expect(finding?.jsonLocation).toEqual({
      file: 'fsh-generated/resources/Questionnaire-A.json',
      pointer: '/entry/2/resource',
      resource: { resourceType: 'Questionnaire', pointer: '/entry/2/resource' },
    });
    expect(finding).not.toHaveProperty('expression');
  });

  it('drops a range that does not fit the expression text', () => {
    const [finding] = run(
      reporting(() => [
        { message: 'm', pointer: calculatedPointer(0), range: { startOffset: 2, endOffset: 99 } },
      ]),
      [document({ item: [item('name')] })],
    );
    expect(finding?.expression).toEqual({ text: '%given.first()' });
  });

  it('applies a configured severity, and a finding-specific severity over it', () => {
    const plugin = reporting(() => [
      { message: 'Default.' },
      { message: 'Own.', severity: 'info' },
    ]);
    const findings = run(plugin, [document({})], { rules: { 'test/rule': 'error' } });
    expect(findings.map((finding) => finding.severity)).toEqual(['error', 'info']);
  });

  it('does not run a rule configured off', () => {
    const findings = run(
      reporting(() => [{ message: 'm' }]),
      [document({})],
      {
        rules: { 'test/rule': 'off' },
      },
    );
    expect(findings).toEqual([]);
  });

  it('runs each rule once per document', () => {
    let calls = 0;
    run(
      reporting(() => {
        calls++;
        return [];
      }),
      [document({ id: 'A' }), document({ id: 'B' }, '/entry/0/resource')],
    );
    expect(calls).toBe(2);
  });

  it('fails the run with RULE_CRASH naming the rule when check throws', () => {
    const plugin = reporting(() => {
      throw new Error('boom');
    });
    expect(() => run(plugin, [document({})])).toThrow(
      expect.objectContaining({
        code: 'RULE_CRASH',
        ruleId: 'test/rule',
        message: 'rule test/rule failed on fsh-generated/resources/Questionnaire-A.json: boom',
      }),
    );
  });

  it.each<[string, RuleFinding, string]>([
    ['a finding without a message', { message: '' }, 'it reported a finding without a message'],
    [
      'an invalid severity',
      { message: 'm', severity: 'fatal' as 'error' },
      'it reported an invalid severity "fatal"',
    ],
    [
      'a location outside its Questionnaire',
      { message: 'm', pointer: '/entry/1/resource' },
      'it reported a location outside its Questionnaire: /entry/1/resource',
    ],
    [
      'a location that is not a pointer',
      { message: 'm', pointer: 'item/0' },
      'it reported a location outside its Questionnaire: item/0',
    ],
  ])('fails with RULE_CRASH for %s', (_name, finding, problem) => {
    expect(() =>
      run(
        reporting(() => [finding]),
        [document({}, '/entry/0/resource')],
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'RULE_CRASH',
        message: expect.stringContaining(problem) as unknown,
      }),
    );
  });
});

describe('fingerprints', () => {
  const fingerprint = (resource: Record<string, unknown>, pointer: string): string | undefined =>
    run(
      reporting(() => [{ message: 'm', pointer }]),
      [document(resource)],
    )[0]?.fingerprint;

  it('do not change when items are inserted before the site', () => {
    const before = fingerprint({ id: 'A', item: [item('name')] }, calculatedPointer(0));
    const after = fingerprint(
      { id: 'A', item: [item('inserted'), item('name')] },
      calculatedPointer(1),
    );
    expect(after).toBe(before);
  });

  it('do not change when an extension moves within its item', () => {
    const moved = item('name');
    moved.extension.reverse();
    expect(
      fingerprint({ id: 'A', item: [moved] }, '/item/0/extension/0/valueExpression/expression'),
    ).toBe(fingerprint({ id: 'A', item: [item('name')] }, calculatedPointer(0)));
  });

  it('tell different sites, declarations and resources apart', () => {
    const resource = { id: 'A', item: [item('name'), item('other')] };
    const values = new Set([
      fingerprint(resource, calculatedPointer(0)),
      fingerprint(resource, calculatedPointer(1)),
      fingerprint(resource, '/item/0/extension/0/valueExpression/expression'),
      fingerprint({ ...resource, id: 'B' }, calculatedPointer(0)),
      fingerprint(resource, '/item/0'),
    ]);
    expect(values.size).toBe(5);
  });

  it('do not change for a stale suppression when the suppress array is reordered', () => {
    const entry = { rule: 'sdc/x', file: 'B.json', linkId: 'name', reason: 'Why.' };
    const other = { rule: 'sdc/y', file: 'C.json', reason: 'Why.' };
    const reordered = [other, entry];
    expect(configFingerprint('lint/stale-suppression', reordered[1] ?? entry)).toBe(
      configFingerprint('lint/stale-suppression', entry),
    );
    expect(configFingerprint('lint/stale-suppression', entry)).not.toBe(
      configFingerprint('lint/stale-suppression', other),
    );
  });
});
