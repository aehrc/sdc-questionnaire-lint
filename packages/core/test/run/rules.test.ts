import { describe, expect, it } from 'vitest';
import type { LintRule } from '../../src/plugins/types.js';
import type { RegisteredRule } from '../../src/plugins/registry.js';
import { runRules } from '../../src/run/rules.js';
import { expressionSite } from '../support/builders.js';

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
