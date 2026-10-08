import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { languageNotInValueSet } from '../../src/rules/language-not-in-value-set.js';
import { expressionSite, fragmentSite } from '../support/builders.js';
import { checkSites } from '../support/rules.js';

const check = (sites: ExpressionSite[]) => checkSites(languageNotInValueSet, sites);

const catalogued = {
  catalogued: true,
  location: {
    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  },
} as const;

describe('sdc/language-not-in-value-set', () => {
  it.each([
    'text/cql',
    'text/fhirpath',
    'application/x-fhir-query',
    'text/x-fhir-query',
    'text/cql-identifier',
    'text/cql-expression',
  ])('accepts %s, an R4 or R5 code', (language) => {
    expect(check([expressionSite({ ...catalogued, language, text: '1' })])).toEqual([]);
  });

  it('reports another language, as written, with a similar code as help', () => {
    const site = expressionSite({ ...catalogued, language: 'text/fhir-path', text: '1' });
    expect(check([site])).toEqual([
      {
        site,
        message:
          'The language text/fhir-path is not one FHIR defines, so the form may ignore this expression.',
        help: 'set the language to text/fhirpath',
      },
    ]);
  });

  it('suggests the code that differs only in case', () => {
    const site = expressionSite({ ...catalogued, language: 'Text/FHIRPath', text: '1' });
    expect(check([site])).toMatchObject([{ help: 'set the language to text/fhirpath' }]);
  });

  it('suggests only a code the location allows', () => {
    const enableWhen = {
      catalogued: true,
      location: {
        url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
      },
    } as const;
    const [query, fhirPath] = check([
      expressionSite({ ...enableWhen, language: 'application/x-fhir-qury', text: 'x' }),
      expressionSite({ ...enableWhen, language: 'Text/FHIRPath', text: '1' }),
    ]);
    expect(query).not.toHaveProperty('help');
    expect(fhirPath).toMatchObject({ help: 'set the language to text/fhirpath' });
  });

  it('gives no help when no code is similar', () => {
    const [finding] = check([expressionSite({ ...catalogued, language: 'text/javascript' })]);
    expect(finding).toBeDefined();
    expect(finding).not.toHaveProperty('help');
  });

  it('checks an uncatalogued site and a reference-only site', () => {
    const sites = [
      expressionSite({ language: 'text/python', text: 'x' }),
      expressionSite({ ...catalogued, language: 'text/python', reference: '#lib' }),
    ];
    expect(check(sites)).toHaveLength(2);
  });

  it('skips a site with no language, and fragments', () => {
    const sites = [
      expressionSite({ ...catalogued, text: '1' }),
      fragmentSite('Patient/{{%id}}', '%id', catalogued),
    ];
    expect(check(sites)).toEqual([]);
  });
});
