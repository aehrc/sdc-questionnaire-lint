import { describe, expect, it } from 'vitest';
import type { LintRule } from '../../src/plugins/types.js';
import type { RegisteredRule } from '../../src/plugins/registry.js';
import { runRules } from '../../src/run/rules.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

const site = expressionSite();
const doc = {
  input: { path: '/ig/Q.json', display: 'Q.json', baseRelative: 'Q.json' },
  document: {
    file: 'Q.json',
    resource: { resourceType: 'Questionnaire' },
    resourcePointer: '',
    localResources: [],
  },
  sites: [site],
};

function registered(severity: RegisteredRule['severity'], reported?: 'info'): RegisteredRule {
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
  return { id: 'test/every-site', rule, severity };
}

describe('runRules', () => {
  it('does not run a rule that is off', () => {
    const rule = registered('off');
    rule.rule.check = () => {
      throw new Error('ran');
    };
    expect(runRules(doc, [rule])).toEqual([]);
  });

  it('reports at the effective severity', () => {
    expect(runRules(doc, [registered('warning')])).toMatchObject([{ severity: 'warning' }]);
  });

  it('keeps a severity the rule reports', () => {
    expect(runRules(doc, [registered('warning', 'info')])).toMatchObject([{ severity: 'info' }]);
  });
});

describe('runRules on a fragment site', () => {
  const query = 'Observation?subject={{%patient.id}}';
  const pointer = '/extension/0/valueExpression/expression';
  const sites = [
    expressionSite({ pointer, language: 'application/x-fhir-query', text: query }),
    fragmentSite(query, '%patient.id', { pointer }),
  ];

  function reportOnce(range?: { startOffset: number; endOffset: number }): RegisteredRule {
    const rule: LintRule = {
      meta: { description: 'Reports every fragment.', defaultSeverity: 'error' },
      check(ctx) {
        for (const site of ctx.sites) {
          if (site.carrier !== 'fragment') continue;
          ctx.report({ site, message: 'Reported.', ...(range === undefined ? {} : { range }) });
        }
      },
    };
    return { id: 'test/every-fragment', rule, severity: 'error' };
  }

  const run = (rule: RegisteredRule) => runRules({ ...doc, sites }, [rule]);

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
