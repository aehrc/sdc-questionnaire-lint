import { describe, expect, it } from 'vitest';
import { summarizeExpressionCoverage } from '../../src/report/expression-coverage.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

describe('summarizeExpressionCoverage', () => {
  const catalogued = {
    catalogued: true,
    location: {
      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
    },
    useCases: ['rendering'],
  } as const;
  const fhirPath = (text: string) => ({ language: 'text/fhirpath', text });

  it('counts a catalogued FHIRPath site with text as analysed, even when it does not parse', () => {
    const sites = [
      expressionSite({ ...catalogued, ...fhirPath('1 + 1') }),
      expressionSite({ ...catalogued, ...fhirPath('a.where(') }),
    ];
    expect(summarizeExpressionCoverage(sites)).toEqual({ analysed: 2, unchecked: 0 });
  });

  it('counts uncatalogued, other-language and reference-only sites as unchecked', () => {
    const sites = [
      expressionSite(fhirPath('1 + 1')),
      expressionSite({ ...catalogued, language: 'text/cql', text: 'AgeInYears()' }),
      expressionSite({ ...catalogued, language: 'text/fhirpath', reference: '#library' }),
      expressionSite({ ...catalogued, language: 'application/x-fhir-query', reference: '#q' }),
    ];
    expect(summarizeExpressionCoverage(sites)).toEqual({ analysed: 0, unchecked: 4 });
  });

  describe('a query and its fragment, counted separately', () => {
    const text = 'Observation?subject={{%patient.id}}';
    const query = (overrides = {}) =>
      expressionSite({ language: 'application/x-fhir-query', text, ...overrides });

    it('counts both as analysed when the query is catalogued', () => {
      const sites = [query(catalogued), fragmentSite(text, '%patient.id', catalogued)];
      expect(summarizeExpressionCoverage(sites)).toEqual({ analysed: 2, unchecked: 0 });
    });

    it('counts both as unchecked when the query is uncatalogued', () => {
      const sites = [query(), fragmentSite(text, '%patient.id')];
      expect(summarizeExpressionCoverage(sites)).toEqual({ analysed: 0, unchecked: 2 });
    });
  });
});
