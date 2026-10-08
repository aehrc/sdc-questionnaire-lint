import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { uncataloguedExpression } from '../../src/rules/uncatalogued-expression.js';
import { expressionSite, fragmentSite } from '../support/builders.js';
import { checkSites } from '../support/rules.js';

const check = (sites: ExpressionSite[]) => checkSites(uncataloguedExpression, sites);

describe('sdc/uncatalogued-expression', () => {
  it('reports an uncatalogued query once, not once per fragment', () => {
    const text = 'Observation?subject={{%patient.id}}&date=gt{{%today}}';
    const query = expressionSite({ language: 'application/x-fhir-query', text });
    const sites = [query, fragmentSite(text, '%patient.id'), fragmentSite(text, '%today')];
    expect(check(sites).map(({ site }) => site)).toEqual([query]);
  });

  it.each([
    [
      'application/x-fhir-query',
      'Patient?_id=1',
      'This expression is in a place the linter does not recognise, so only its query shape and the FHIRPath in its {{…}} fragments can be checked.',
    ],
    [
      'text/x-fhir-query',
      'Patient?_id=1',
      'This expression is in a place the linter does not recognise, so only its query shape and the FHIRPath in its {{…}} fragments can be checked.',
    ],
    [
      'text/cql',
      'AgeInYears()',
      'This expression is in a place the linter does not recognise, so it was not checked.',
    ],
  ])('says what can still be checked in %s', (language, text, message) => {
    expect(check([expressionSite({ language, text })])).toMatchObject([{ message }]);
  });
});
