import { describe, expect, it, onTestFinished } from 'vitest';
import { analyseDocument } from '../../src/analysis/document-analysis.js';
import type { ExpressionSite, QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import { lint } from '../../src/index.js';
import type { LintRule, RuleContext, RuleFinding } from '../../src/plugins/contract.js';
import type { ResolvedRule } from '../../src/plugins/rule-set.js';
import { runRules } from '../../src/run/rules.js';
import { expressionSite, fragmentSite } from '../support/builders.js';
import { expectValidReport } from '../support/report.js';
import { tempTree } from '../support/tmp.js';

const site = expressionSite();
const document = {
  file: 'Q.json',
  resource: { resourceType: 'Questionnaire' },
  resourcePointer: '',
  localResources: [],
};
const doc = {
  input: { path: '/ig/Q.json', display: 'Q.json', baseRelative: 'Q.json' },
  document,
  sites: [site],
  analysis: analyseDocument(document, [site]),
};

function resolved(setting: ResolvedRule['setting'], reported?: 'info'): ResolvedRule {
  const rule: LintRule = {
    meta: { description: 'Reports every site.', defaultSeverity: 'error' },
    check(ctx) {
      for (const each of ctx.sites) {
        ctx.report({
          site: each,
          message: 'Reported.',
          ...(reported ? { severity: reported } : {}),
        });
      }
    },
  };
  return { id: 'test/every-site', namespace: 'test', rule, setting, compat: {} };
}

describe('runRules', () => {
  it('does not run a rule that is off', () => {
    const rule = resolved('off');
    rule.rule.check = () => {
      throw new Error('ran');
    };
    expect(runRules(doc, [rule])).toEqual([]);
  });

  it('reports at the effective severity', () => {
    expect(runRules(doc, [resolved('warning')])).toMatchObject([{ severity: 'warning' }]);
  });

  it('keeps a severity the rule reports', () => {
    expect(runRules(doc, [resolved('warning', 'info')])).toMatchObject([{ severity: 'info' }]);
  });
});

describe('runRules on a fragment site', () => {
  const query = 'Observation?subject={{%patient.id}}';
  const pointer = '/extension/0/valueExpression/expression';
  const sites = [
    expressionSite({ pointer, language: 'application/x-fhir-query', text: query }),
    fragmentSite(query, '%patient.id', { pointer }),
  ];

  function reportOnce(range?: { startOffset: number; endOffset: number }): ResolvedRule {
    const rule: LintRule = {
      meta: { description: 'Reports every fragment.', defaultSeverity: 'error' },
      check(ctx) {
        for (const site of ctx.sites) {
          if (site.carrier !== 'fragment') continue;
          ctx.report({ site, message: 'Reported.', ...(range === undefined ? {} : { range }) });
        }
      },
    };
    return { id: 'test/every-fragment', namespace: 'test', rule, setting: 'error', compat: {} };
  }

  const run = (rule: ResolvedRule) => runRules({ ...doc, sites }, [rule]);

  it('shows the finding in the query, with the range rebased onto it', () => {
    const [finding] = run(reportOnce({ startOffset: 9, endOffset: 11 }));
    expect(finding?.expression).toEqual({ text: query, range: { startOffset: 31, endOffset: 33 } });
  });

  it('covers the whole fragment when the rule gives no range', () => {
    const [finding] = run(reportOnce());
    expect(finding?.expression).toEqual({ text: query, range: { startOffset: 22, endOffset: 33 } });
  });

  it("points at the query's text", () => {
    const [finding] = run(reportOnce());
    expect(finding?.jsonLocation.pointer).toBe(pointer);
  });
});

describe('runRules on what a rule reports', () => {
  const resourcePointer = '/entry/0/resource';
  const query = 'Observation?subject={{%patient.id}}';
  const textSite = expressionSite({ pointer: `${resourcePointer}/item/0/x`, text: 'today()' });
  const queryFragment = fragmentSite(query, '%patient.id', { pointer: `${resourcePointer}/y` });
  const inBundle = {
    input: doc.input,
    document: { ...doc.document, resourcePointer },
    sites: [textSite, queryFragment],
    analysis: doc.analysis,
  };

  function ruleThat(check: (ctx: RuleContext) => unknown): ResolvedRule {
    const rule = {
      meta: { description: 'A test rule.', defaultSeverity: 'error' },
      check,
    } as LintRule;
    return { id: 'test/rule', namespace: 'test', rule, setting: 'error', compat: {} };
  }
  const reporting = (finding: unknown) =>
    ruleThat((ctx) => {
      ctx.report(finding as RuleFinding);
    });
  const crash = (message: string): unknown =>
    expect.objectContaining({
      code: 'RULE_CRASH',
      ruleId: 'test/rule',
      message,
      help: 'this is a bug in the test plugin; report it to its maintainers',
    });
  const invalid = (problem: string): unknown =>
    crash(`rule test/rule reported an invalid finding: ${problem}`);

  it.each<[string, (sites: typeof inBundle.sites) => unknown, string]>([
    ['an empty message', ([site]) => ({ site, message: '' }), 'message is not a non-empty string'],
    [
      'an empty help',
      ([site]) => ({ site, message: 'm', help: '' }),
      'help is not a non-empty string',
    ],
    [
      'an empty note',
      ([site]) => ({ site, message: 'm', note: '' }),
      'note is not a non-empty string',
    ],
    [
      'a bad severity',
      ([site]) => ({ site, message: 'm', severity: 'fatal' }),
      'severity is not error, warning or info',
    ],
    [
      'a foreign site',
      ([site]) => ({ site: { ...site }, message: 'm' }),
      'site is not one of ctx.sites',
    ],
    [
      'a pointer outside the resource',
      () => ({ pointer: '/entry/1/resource', message: 'm' }),
      'pointer /entry/1/resource is outside the resource at /entry/0/resource',
    ],
    [
      'a pointer that only shares a prefix with the resource',
      () => ({ pointer: '/entry/0/resourceType', message: 'm' }),
      'pointer /entry/0/resourceType is outside the resource at /entry/0/resource',
    ],
    [
      'a pointer with a bad escape',
      () => ({ pointer: '/entry/0/resource/a~2', message: 'm' }),
      'pointer "/entry/0/resource/a~2" is not a JSON Pointer',
    ],
    [
      'a pointer without a leading /',
      () => ({ pointer: 'entry/0/resource', message: 'm' }),
      'pointer "entry/0/resource" is not a JSON Pointer',
    ],
    [
      'a range without text',
      () => ({ message: 'm', range: { startOffset: 0, endOffset: 1 } }),
      'range needs a site with text',
    ],
    [
      'a range past the end',
      ([site]) => ({ site, message: 'm', range: { startOffset: 0, endOffset: 8 } }),
      "range is not within the site's text: expected integer offsets with 0 <= startOffset <= endOffset <= 7",
    ],
    [
      'a range past the end of a fragment',
      ([, site]) => ({ site, message: 'm', range: { startOffset: 0, endOffset: 12 } }),
      "range is not within the site's text: expected integer offsets with 0 <= startOffset <= endOffset <= 11",
    ],
    [
      'a reversed range',
      ([site]) => ({ site, message: 'm', range: { startOffset: 3, endOffset: 2 } }),
      "range is not within the site's text: expected integer offsets with 0 <= startOffset <= endOffset <= 7",
    ],
    ['a finding that is not an object', () => 'm', 'the finding is not an object'],
    [
      'relatedLocations that are not an array',
      () => ({ message: 'm', relatedLocations: {} }),
      'relatedLocations is not an array',
    ],
    [
      'a related location with no site or pointer',
      () => ({ message: 'm', relatedLocations: [{ message: 'here' }] }),
      'relatedLocations[0] has no site or pointer',
    ],
    [
      'a related site that is not in ctx.sites',
      ([site]) => ({ message: 'm', relatedLocations: [{ site: { ...site } }] }),
      'relatedLocations[0].site is not one of ctx.sites',
    ],
    [
      'a related pointer outside the resource',
      () => ({ message: 'm', relatedLocations: [{ pointer: '/entry/1/resource' }] }),
      'relatedLocations[0].pointer /entry/1/resource is outside the resource at /entry/0/resource',
    ],
    [
      'a related location with an empty message',
      ([site]) => ({ message: 'm', relatedLocations: [{ site, message: '' }] }),
      'relatedLocations[0].message is not a non-empty string',
    ],
    [
      'a pointer that is not a string',
      () => ({ pointer: 1n, message: 'm' }),
      'pointer is not a string',
    ],
    [
      'a circular pointer',
      () => {
        const pointer: Record<string, unknown> = {};
        pointer.self = pointer;
        return { pointer, message: 'm' };
      },
      'pointer is not a string',
    ],
    [
      'a finding whose getter throws',
      () => ({
        get message(): string {
          throw new Error('getter');
        },
      }),
      'reading the finding threw an exception',
    ],
  ])('gives RULE_CRASH for %s', (_, finding, problem) => {
    expect(() => runRules(inBundle, [reporting(finding(inBundle.sites))])).toThrow(
      invalid(problem),
    );
  });

  it('gives RULE_CRASH when the rule catches around report()', () => {
    const rule = ruleThat((ctx) => {
      try {
        ctx.report({ message: '' });
      } catch {
        // A rule must not be able to swallow its own invalid finding.
      }
      ctx.report({ message: 'A valid finding after the invalid one.' });
    });
    expect(() => runRules(inBundle, [rule])).toThrow(invalid('message is not a non-empty string'));
  });

  it('gives RULE_CRASH for an async rule', () => {
    expect(() =>
      runRules(inBundle, [
        ruleThat(async () => {
          await Promise.resolve();
        }),
      ]),
    ).toThrow(crash('rule test/rule returned a promise; check must be synchronous'));
  });

  it('gives RULE_CRASH for an async rule that rejects, leaving no unhandled rejection', async () => {
    let unhandled: unknown;
    const listener = (reason: unknown) => {
      unhandled = reason;
    };
    process.on('unhandledRejection', listener);
    onTestFinished(() => {
      process.off('unhandledRejection', listener);
    });
    const rejects = ruleThat(async () => {
      await Promise.resolve();
      throw new Error('late');
    });
    expect(() => runRules(inBundle, [rejects])).toThrow(
      crash('rule test/rule returned a promise; check must be synchronous'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).toBeUndefined();
  });

  it('gives RULE_CRASH for a thenable whose then throws', () => {
    const thenable = ruleThat(() => ({
      then() {
        throw new Error('boom');
      },
    }));
    expect(() => runRules(inBundle, [thenable])).toThrow(crash('rule test/rule crashed: boom'));
  });

  it('gives RULE_CRASH for a thrown value that cannot be described', () => {
    const throwing = ruleThat(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a plugin may throw anything.
      throw {
        toString(): string {
          throw new Error('toString');
        },
      };
    });
    expect(() => runRules(inBundle, [throwing])).toThrow(
      crash('rule test/rule crashed: a value that cannot be described'),
    );
  });

  it('keeps the range it checked when the rule changes it afterwards', () => {
    const rule = ruleThat((ctx) => {
      const range = { startOffset: 0, endOffset: 5 };
      ctx.report({ site: textSite, message: 'Ranged.', range });
      range.endOffset = 99;
    });
    const [finding] = runRules(inBundle, [rule]);
    expect(finding?.expression?.range).toEqual({ startOffset: 0, endOffset: 5 });
  });

  it('gives RULE_CRASH with the message of a thrown error, without a stack', () => {
    const throwing = ruleThat(() => {
      throw new Error('boom');
    });
    expect(() => runRules(inBundle, [throwing])).toThrow(crash('rule test/rule crashed: boom'));
  });

  it('maps related sites and pointers to locations in the report', () => {
    const rule = ruleThat((ctx) => {
      ctx.report({
        pointer: `${resourcePointer}/extension/1`,
        message: 'Related.',
        relatedLocations: [
          { site: textSite, message: 'the site' },
          { pointer: `${resourcePointer}/extension/0` },
        ],
      });
    });
    const [finding] = runRules(inBundle, [rule]);
    const resource = { resourceType: 'Questionnaire', pointer: resourcePointer };
    const sourceLocation = { status: 'unmapped', reason: 'source-unavailable' };
    expect(finding?.relatedLocations).toEqual([
      {
        kind: 'questionnaire',
        jsonLocation: { file: 'Q.json', pointer: textSite.pointer, resource },
        sourceLocation,
        message: 'the site',
      },
      {
        kind: 'questionnaire',
        jsonLocation: { file: 'Q.json', pointer: `${resourcePointer}/extension/0`, resource },
        sourceLocation,
      },
    ]);
  });

  it("passes core's analysis to sdc rules only, never to a plugin rule", () => {
    const received: unknown[][] = [];
    const recording = {
      meta: { description: 'Records its arguments.', defaultSeverity: 'error' },
      check: (...args: unknown[]) => {
        received.push(args);
      },
    } as LintRule;
    runRules(inBundle, [
      { id: 'test/rule', namespace: 'test', rule: recording, setting: 'error', compat: {} },
      { id: 'sdc/rule', namespace: 'sdc', rule: recording, setting: 'error', compat: {} },
    ]);
    expect(received.map((args) => args.length)).toEqual([1, 2]);
    expect(received[1]?.[1]).toBe(inBundle.analysis);
  });

  it('accepts a pointer at the resource itself, and findings with site and range', () => {
    const rule = ruleThat((ctx) => {
      ctx.report({ pointer: resourcePointer, message: 'At the resource.' });
      ctx.report({ site: textSite, message: 'Ranged.', range: { startOffset: 0, endOffset: 7 } });
    });
    expect(runRules(inBundle, [rule])).toHaveLength(2);
  });
});

describe('RuleContext name analysis (API stage B)', () => {
  const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
  const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
  const expression = (language: string, text: string, name?: string) => ({
    ...(name === undefined ? {} : { name }),
    language,
    expression: text,
  });
  const calculated = (language: string, text: string) => ({
    url: `${sdc}calculatedExpression`,
    valueExpression: expression(language, text),
  });
  const document: QuestionnaireDocument = {
    file: 'Q.json',
    resource: {
      resourceType: 'Questionnaire',
      extension: [
        { url: VARIABLE, valueExpression: expression('text/fhirpath', "'T'", 'title') },
        {
          url: VARIABLE,
          valueExpression: expression(
            'application/x-fhir-query',
            'Observation?subject={{%patient.id}}',
            'obs',
          ),
        },
        { url: 'http://example.org/x', valueExpression: expression('text/fhirpath', '%title') },
      ],
      item: [
        {
          linkId: 'a',
          extension: [
            calculated('text/fhirpath', '%title & %qitem.linkId'),
            calculated('text/fhirpath', "'x'"),
            calculated('text/cql', '%title'),
            calculated('text/fhirpath', '%title.('),
            calculated('text/fhirpath', "defineVariable('v' + 'w', 1).select(%v)"),
          ],
        },
      ],
    },
    resourcePointer: '',
    localResources: [],
  };
  const sites = findExpressionSites(document);
  const analysed = {
    input: doc.input,
    document,
    sites,
    analysis: analyseDocument(document, sites, ['host']),
  };
  const at = (carrier: ExpressionSite['carrier'], text: string): ExpressionSite => {
    const found = sites.find((site) => site.carrier === carrier && site.text === text);
    if (found === undefined) throw new Error(`no ${carrier} site with ${text}`);
    return found;
  };

  // What a plugin rule receives from ctx for each of the given sites.
  function received<T>(read: (ctx: RuleContext, site: ExpressionSite) => T, of: ExpressionSite[]) {
    const results: T[] = [];
    const rule = {
      meta: { description: 'Records what it receives.', defaultSeverity: 'error' },
      check: (ctx: RuleContext) => {
        for (const site of of) results.push(read(ctx, site));
      },
    } as LintRule;
    runRules(analysed, [
      { id: 'test/rule', namespace: 'test', rule, setting: 'error', compat: {} },
    ]);
    return results;
  }
  const references = (...of: ExpressionSite[]) =>
    received((ctx, site) => ctx.referencesAt(site), of);

  it('gives the references of a FHIRPath site, with offsets and complete', () => {
    expect(references(at('expression', '%title & %qitem.linkId'))).toEqual([
      [
        { name: 'title', startOffset: 0, endOffset: 6, complete: true },
        { name: 'qitem', startOffset: 9, endOffset: 15, complete: true },
      ],
    ]);
    expect(references(at('expression', "defineVariable('v' + 'w', 1).select(%v)"))).toEqual([
      [{ name: 'v', startOffset: 36, endOffset: 38, complete: false }],
    ]);
  });

  it('gives [] for FHIRPath that references nothing', () => {
    expect(references(at('expression', "'x'"))).toEqual([[]]);
  });

  it('gives undefined where there is no FHIRPath analysis', () => {
    const cql = sites.find((site) => site.language === 'text/cql');
    if (cql === undefined) throw new Error('no CQL site');
    const query = at('expression', 'Observation?subject={{%patient.id}}');
    expect(references(cql, query, at('expression', '%title.('))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('gives undefined for a copy of a site', () => {
    const copy = { ...at('expression', "'x'") };
    expect(
      received((ctx, site) => [ctx.referencesAt(site), ctx.variablesAt(site)], [copy]),
    ).toEqual([[undefined, undefined]]);
  });

  it('gives the references of a fragment site', () => {
    expect(references(at('fragment', '%patient.id'))).toEqual([
      [{ name: 'patient', startOffset: 0, endOffset: 8, complete: true }],
    ]);
  });

  it('freezes the references, so a rule cannot change what later rules and suppressions read', () => {
    const [found] = references(at('expression', '%title & %qitem.linkId'));
    expect(Object.isFrozen(found)).toBe(true);
    expect(() => (found as unknown as { name: string }[]).push({ name: 'x' })).toThrow(TypeError);
    expect(() => {
      (found?.[0] as { name: string }).name = 'x';
    }).toThrow(TypeError);
  });

  it('gives no variables at an uncatalogued site', () => {
    const uncatalogued = sites.find((site) => !site.catalogued);
    expect(uncatalogued).toBeDefined();
    expect(
      received((ctx, site) => ctx.variablesAt(site), [uncatalogued as ExpressionSite]),
    ).toEqual([undefined]);
  });

  it('resolves built-in, declared and host names', () => {
    const item = at('expression', "'x'");
    const root = at('fragment', '%patient.id');
    const [atItem, atRoot] = received((ctx, site) => ctx.variablesAt(site), [item, root]);
    expect(atItem?.resolve('questionnaire')).toEqual({ name: 'questionnaire', origin: 'builtin' });
    expect(atItem?.resolve('qitem')).toEqual({ name: 'qitem', origin: 'builtin' });
    expect(atRoot?.resolve('qitem')).toBeUndefined();
    expect(atItem?.resolve('title')).toMatchObject({
      origin: 'declaration',
      declaration: {
        name: 'title',
        kind: 'variable',
        pointer: '/extension/0/valueExpression/expression',
      },
    });
    expect(atItem?.resolve('host')).toEqual({ name: 'host', origin: 'host' });
  });
});

describe('plugin findings in a report', () => {
  it('produce a valid report for each accepted shape', async () => {
    const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'A',
      status: 'draft',
      extension: [
        {
          url: `${sdc}itemPopulationContext`,
          valueExpression: {
            name: 'obs',
            language: 'application/x-fhir-query',
            expression: 'Observation?subject={{%patient.id}}',
          },
        },
      ],
      item: [
        {
          linkId: 'age',
          extension: [
            {
              url: `${sdc}calculatedExpression`,
              valueExpression: { language: 'text/fhirpath', expression: 'today()' },
            },
          ],
        },
      ],
    };
    const cwd = await tempTree({
      'sdc-questionnaire-lint.config.mjs': `
        export default {
          plugins: [{
            meta: { name: 'demo', version: '0.0.0' },
            rules: {
              shapes: {
                meta: { description: 'Reports every accepted shape.', defaultSeverity: 'warning' },
                check(ctx) {
                  const text = ctx.sites.find((site) => site.carrier === 'expression' && site.text === 'today()');
                  const fragment = ctx.sites.find((site) => site.carrier === 'fragment');
                  ctx.report({ site: text, message: 'On a site.', range: { startOffset: 0, endOffset: 5 } });
                  ctx.report({ site: fragment, message: 'On a fragment.', range: { startOffset: 1, endOffset: 8 } });
                  ctx.report({
                    pointer: ctx.document.resourcePointer + '/item/0',
                    message: 'On an item.',
                    help: 'do something',
                    note: 'something else',
                    severity: 'info',
                  });
                },
              },
            },
          }],
        };
      `,
      'fsh-generated/resources/Bundle-B.json': JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: questionnaire }],
      }),
    });
    const report = await lint({ cwd });
    expectValidReport(report);
    expect(report.findings.filter(({ ruleId }) => ruleId === 'demo/shapes')).toMatchObject([
      { expression: { text: 'today()', range: { startOffset: 0, endOffset: 5 } } },
      {
        expression: {
          text: 'Observation?subject={{%patient.id}}',
          range: { startOffset: 23, endOffset: 30 },
        },
      },
      {
        severity: 'info',
        jsonLocation: { pointer: '/entry/0/resource/item/0' },
        help: 'do something',
        note: 'something else',
      },
    ]);
    expect(report.run.plugins.map(({ name }) => name)).toEqual(['demo', 'sdc']);
  });

  it('never runs a plugin rule configured off', async () => {
    const cwd = await tempTree({
      'sdc-questionnaire-lint.config.mjs': `export default {
        plugins: [{
          meta: { name: 'demo', version: '0.0.0' },
          rules: {
            boom: {
              meta: { description: 'Always crashes.', defaultSeverity: 'error' },
              check() { throw new Error('ran'); },
            },
          },
        }],
        rules: { 'demo/boom': 'off' },
      };`,
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        status: 'draft',
      }),
    });
    expect((await lint({ cwd })).status).toBe('completed');
  });
});
