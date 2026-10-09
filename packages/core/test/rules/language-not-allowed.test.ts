import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { languageNotAllowed } from '../../src/rules/language-not-allowed.js';
import { expressionSite } from '../support/builders.js';
import { checkSites } from '../support/rules.js';

const check = (sites: ExpressionSite[]) => checkSites(languageNotAllowed, sites);

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const enableWhen = { catalogued: true, location: { url: `${sdc}enableWhenExpression` } } as const;
const toggle = {
  catalogued: true,
  location: { url: `${sdc}answerOptionsToggleExpression`, subExtension: 'expression' },
} as const;
const help =
  'rewrite the expression in FHIRPath, with the language text/fhirpath, or in CQL, with text/cql';

describe('sdc/language-not-allowed', () => {
  it.each(['text/fhirpath', 'text/cql', 'text/cql-identifier', 'text/cql-expression'])(
    'allows %s on enableWhenExpression and answerOptionsToggleExpression',
    (language) => {
      const sites = [enableWhen, toggle].map((at) =>
        expressionSite({ ...at, language, text: '1' }),
      );
      expect(check(sites)).toEqual([]);
    },
  );

  it('reports text/x-fhir-query on enableWhenExpression, as written', () => {
    const site = expressionSite({
      ...enableWhen,
      language: 'text/x-fhir-query',
      text: 'Observation?code=x',
    });
    expect(check([site])).toEqual([
      {
        site,
        message:
          'This enableWhenExpression is written in text/x-fhir-query, but SDC allows only FHIRPath or CQL here, so the form may ignore it.',
        help,
      },
    ]);
  });

  it('leaves application/x-fhir-query on enableWhenExpression to the FHIR Validator', () => {
    const site = expressionSite({ ...enableWhen, language: 'application/x-fhir-query', text: 'x' });
    expect(check([site])).toEqual([]);
  });

  it.each(['application/x-fhir-query', 'text/x-fhir-query'])(
    'reports %s on answerOptionsToggleExpression',
    (language) => {
      const site = expressionSite({ ...toggle, language, text: 'Observation?code=x' });
      expect(check([site])).toEqual([
        {
          site,
          message: `This answerOptionsToggleExpression is written in ${language}, but SDC allows only FHIRPath or CQL here, so the form may ignore it.`,
          help,
        },
      ]);
    },
  );

  it('reports another language these locations do not allow', () => {
    const sites = [enableWhen, toggle].map((at) =>
      expressionSite({ ...at, language: 'text/javascript', reference: '#lib' }),
    );
    expect(check(sites)).toHaveLength(2);
  });

  it('allows any language at a location without a restriction, and at contextExpression', () => {
    const sites = [
      expressionSite({
        catalogued: true,
        location: { url: `${sdc}calculatedExpression` },
        language: 'text/x-fhir-query',
        text: 'Patient?_id=1',
      }),
      expressionSite({
        catalogued: true,
        location: { url: `${sdc}contextExpression`, subExtension: 'expression' },
        language: 'text/javascript',
        text: 'x',
      }),
    ];
    expect(check(sites)).toEqual([]);
  });

  it('skips an uncatalogued site and a site with no language', () => {
    const sites = [
      expressionSite({ language: 'text/x-fhir-query', text: 'Patient?_id=1' }),
      expressionSite({ ...enableWhen, text: '1' }),
    ];
    expect(check(sites)).toEqual([]);
  });
});
