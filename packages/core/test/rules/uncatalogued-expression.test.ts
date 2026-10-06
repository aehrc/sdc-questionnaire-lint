import { describe, expect, it } from 'vitest';
import type { ExpressionSite, RuleFinding } from '../../src/plugins/types.js';
import { uncataloguedExpression } from '../../src/rules/uncatalogued-expression.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

function check(sites: ExpressionSite[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  uncataloguedExpression.check({
    document: { file: 'Q.json', resource: {}, resourcePointer: '', localResources: [] },
    sites,
    scopeAt: () => ({ available: false, names: [] }),
    options: undefined,
    report: (finding) => findings.push(finding),
  });
  return findings;
}

describe('sdc/uncatalogued-expression', () => {
  it('reports an uncatalogued query once, not once per fragment', () => {
    const text = 'Observation?subject={{%patient.id}}&date=gt{{%today}}';
    const query = expressionSite({ language: 'application/x-fhir-query', text });
    const sites = [query, fragmentSite(text, '%patient.id'), fragmentSite(text, '%today')];
    expect(check(sites).map(({ site }) => site)).toEqual([query]);
  });
});
