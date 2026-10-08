import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { externalExpression } from '../../src/rules/external-expression.js';
import { expressionSite, fragmentSite } from '../support/builders.js';
import { checkSites } from '../support/rules.js';

const check = (sites: ExpressionSite[]) => checkSites(externalExpression, sites);

const catalogued = {
  catalogued: true,
  location: {
    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  },
} as const;

describe('sdc/external-expression', () => {
  it('reports an Expression with a reference and no text', () => {
    const site = expressionSite({ ...catalogued, language: 'text/cql', reference: '#lib' });
    expect(check([site])).toEqual([
      {
        site,
        message: 'This expression has no text, only the reference #lib, so it was not checked.',
      },
    ]);
  });

  it('skips an Expression with text, even when it also has a reference, and fragments', () => {
    const sites = [
      expressionSite({ ...catalogued, language: 'text/fhirpath', text: '1' }),
      expressionSite({ ...catalogued, language: 'text/fhirpath', text: '1', reference: '#lib' }),
      fragmentSite('Patient/{{%id}}', '%id', catalogued),
    ];
    expect(check(sites)).toEqual([]);
  });

  it('skips an Expression with neither text nor reference', () => {
    expect(check([expressionSite({ ...catalogued, language: 'text/fhirpath' })])).toEqual([]);
  });
});
